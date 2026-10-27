import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { titleCase } from "@/components/loads"
import { db, schema } from "@/db"
import type { Load, StatusEventRow, Tender } from "@/db/schema"
import { formatRelative } from "@/lib/format"
import { arcPoint } from "@/lib/geo/arc"
import { postalCentroid, type LngLat } from "@/lib/geo/postal"
import { LOAD_STATUS_LABELS, STATUS_LABELS } from "@/lib/loads/codes"
import type { EventLocation } from "@/lib/loads/status"
import type { TenderBlock, TenderStop } from "@/lib/loads/tender"
import { stopTimeToMs } from "@/lib/time-zones"

import type { AnalyticsFilters } from "./filters"
import { tenderScope } from "./scope"

/**
 * The geographic picture of the business: where freight is tendered from
 * and to, the lanes between, and where loads on the road are now. Places
 * come from the 204's stop addresses via postal code centroids; positions
 * from the latest 214, or the schedule when the 214 carried no coordinates.
 */

export type Facility = {
  key: string
  name: string
  place: string
  position: LngLat
  pickups: number
  deliveries: number
}

export type LaneStat = {
  key: string
  from: LngLat
  to: LngLat
  origin: string
  destination: string
  tenders: number
  accepted: number
  declined: number
  cancelled: number
  open: number
  delivered: number
  onTheRoad: number
}

export type Truck = {
  loadNumber: string
  tenderId: number
  origin: string
  destination: string
  status: Load["status"]
  statusLabel: string
  /** "Departed pickup 3h 10m ago". */
  lastUpdate: string | null
  position: LngLat
  /** True when placed from the schedule rather than a reported position. */
  estimated: boolean
}

export type GeoPicture = {
  tenders: number
  facilities: Facility[]
  lanes: LaneStat[]
  trucks: Truck[]
  /** Stops with no centroid for their postal code, so not on the map. */
  unplaced: string[]
}

const MOVING: Load["status"][] = ["at_pickup", "in_transit", "at_delivery"]

export function getGeoPicture(options: {
  filters: AnalyticsFilters
  now: number
}): GeoPicture {
  const rows = db
    .select({ tender: schema.tenders, load: schema.loads })
    .from(schema.tenders)
    .leftJoin(schema.loads, eq(schema.loads.tenderId, schema.tenders.id))
    .where(tenderScope(options.filters, options.now))
    .all()

  const facilities = new Map<string, Facility>()
  const lanes = new Map<string, LaneStat>()
  const unplaced = new Set<string>()

  const facilityFor = (stop: TenderStop): Facility | null => {
    const a = stop.address
    const position = postalCentroid(a.postalCode, a.country)
    if (!position) {
      unplaced.add(`${stop.name}, ${a.postalCode} ${a.country}`)
      return null
    }
    const key = `${a.country}:${a.postalCode}:${stop.name}`
    let f = facilities.get(key)
    if (!f) {
      f = {
        key,
        name: titleCase(stop.name),
        place: place(a.city, a.state),
        position,
        pickups: 0,
        deliveries: 0,
      }
      facilities.set(key, f)
    }
    return f
  }

  for (const { tender, load } of rows) {
    const stops = (JSON.parse(tender.tender) as TenderBlock).stops
    for (const stop of stops) {
      const f = facilityFor(stop)
      if (f && stop.type === "pickup") f.pickups++
      if (f && stop.type === "delivery") f.deliveries++
    }

    const ends = laneEnds(stops)
    const from = ends && facilityFor(ends.pickup)
    const to = ends && facilityFor(ends.delivery)
    if (!from || !to) continue
    const key = `${from.key}>${to.key}`
    let lane = lanes.get(key)
    if (!lane) {
      lane = {
        key,
        from: from.position,
        to: to.position,
        origin: from.place,
        destination: to.place,
        tenders: 0,
        accepted: 0,
        declined: 0,
        cancelled: 0,
        open: 0,
        delivered: 0,
        onTheRoad: 0,
      }
      lanes.set(key, lane)
    }
    lane.tenders++
    lane[tender.status]++
    if (load?.status === "delivered") lane.delivered++
    if (load && MOVING.includes(load.status)) lane.onTheRoad++
  }

  return {
    tenders: rows.length,
    facilities: [...facilities.values()],
    lanes: [...lanes.values()],
    trucks: getTrucks(options.filters, options.now),
    unplaced: [...unplaced],
  }
}

/**
 * Every load between pickup and delivery for the shown shippers, whenever
 * it was tendered: the period selects history, not what is moving now.
 */
function getTrucks(filters: AnalyticsFilters, now: number): Truck[] {
  const rows = db
    .select({ load: schema.loads, tender: schema.tenders })
    .from(schema.loads)
    .innerJoin(schema.tenders, eq(schema.loads.tenderId, schema.tenders.id))
    .where(
      and(
        inArray(schema.loads.status, MOVING),
        tenderScope(filters, now, { period: false })
      )
    )
    .all()
  if (!rows.length) return []

  const events = new Map<number, StatusEventRow[]>()
  for (const e of db
    .select()
    .from(schema.statusEvents)
    .where(
      inArray(
        schema.statusEvents.loadId,
        rows.map((r) => r.load.id)
      )
    )
    .orderBy(schema.statusEvents.id)
    .all()) {
    events.set(e.loadId, [...(events.get(e.loadId) ?? []), e])
  }

  const trucks: Truck[] = []
  for (const { load, tender } of rows) {
    const ends = laneEnds((JSON.parse(tender.tender) as TenderBlock).stops)
    const from =
      ends &&
      postalCentroid(
        ends.pickup.address.postalCode,
        ends.pickup.address.country
      )
    const to =
      ends &&
      postalCentroid(
        ends.delivery.address.postalCode,
        ends.delivery.address.country
      )
    const loadEvents = (events.get(load.id) ?? []).filter(
      (e) => e.type === "status"
    )
    const last = loadEvents.at(-1)
    const reported = last && reportedPosition(last)

    let position: LngLat | null = reported ?? null
    let estimated = false
    if (!position && from && to) {
      estimated = load.status === "in_transit"
      position =
        load.status === "at_pickup"
          ? from
          : load.status === "at_delivery"
            ? to
            : arcPoint(from, to, progress(tender, loadEvents, now))
    }
    if (!position) continue

    trucks.push({
      loadNumber: load.loadNumber,
      tenderId: tender.id,
      origin: place(tender.originCity, tender.originState),
      destination: place(tender.destinationCity, tender.destinationState),
      status: load.status,
      statusLabel: LOAD_STATUS_LABELS[load.status],
      lastUpdate: last
        ? `${STATUS_LABELS[last.code] ?? last.code} ${formatRelative(Date.parse(last.createdAt), now)}`
        : null,
      position,
      estimated,
    })
  }
  return trucks
}

/** The lane a tender runs: first pickup to last delivery, as on its summary. */
function laneEnds(
  stops: TenderStop[]
): { pickup: TenderStop; delivery: TenderStop } | null {
  const pickup = stops.find((s) => s.type === "pickup")
  const delivery = stops.findLast((s) => s.type === "delivery")
  return pickup && delivery ? { pickup, delivery } : null
}

/**
 * How far along its lane an in-transit load should be, from when it left
 * pickup to its delivery appointment. Kept off the end points, so an
 * estimated truck never looks like it has arrived.
 */
function progress(
  tender: Tender,
  events: StatusEventRow[],
  now: number
): number {
  const departed = events.find((e) => e.code === "AF")
  const start = departed
    ? Date.parse(departed.createdAt)
    : stopTimeToMs(tender.pickupAt, tender.originState)
  const end = stopTimeToMs(tender.deliveryAt, tender.destinationState)
  if (start === null || end === null || end <= start) return 0.5
  return Math.min(0.95, Math.max(0.05, (now - start) / (end - start)))
}

/** The position a 214 reported, when it carried coordinates. */
function reportedPosition(event: StatusEventRow): LngLat | null {
  const c = (JSON.parse(event.location) as EventLocation).coordinates
  return c ? [c.longitude, c.latitude] : null
}

function place(city: string | null, state: string | null): string {
  return [titleCase(city), state].filter(Boolean).join(", ")
}
