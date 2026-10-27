import "server-only"

import { desc, eq, inArray } from "drizzle-orm"

import { db, schema } from "@/db"
import type {
  Load,
  StatusEventRow,
  Tender,
  TenderResponse,
  TenderVersion,
} from "@/db/schema"

/** Read side of the carrier's tenders and loads, for the live views. */

export type TenderListItem = { tender: Tender; load: Load | null }

/** Tenders, newest first; only the given statuses when any are named. */
export function getTenders(
  options: { status?: Tender["status"][]; limit?: number } = {}
): TenderListItem[] {
  return db
    .select({ tender: schema.tenders, load: schema.loads })
    .from(schema.tenders)
    .leftJoin(schema.loads, eq(schema.loads.tenderId, schema.tenders.id))
    .where(
      options.status
        ? inArray(schema.tenders.status, options.status)
        : undefined
    )
    .orderBy(desc(schema.tenders.createdAt), desc(schema.tenders.id))
    .limit(options.limit ?? 100)
    .all()
}

export type LoadListItem = {
  load: Load
  tender: Tender
  /** The most recent 214 sent for the load. */
  lastEvent: StatusEventRow | null
}

/** Loads in the given statuses, by pickup time, each with its latest 214. */
export function getLoads(
  options: { status?: Load["status"][] } = {}
): LoadListItem[] {
  const rows = db
    .select({ load: schema.loads, tender: schema.tenders })
    .from(schema.loads)
    .innerJoin(schema.tenders, eq(schema.loads.tenderId, schema.tenders.id))
    .where(
      options.status ? inArray(schema.loads.status, options.status) : undefined
    )
    .orderBy(schema.tenders.pickupAt, schema.loads.id)
    .all()

  const latest = new Map<number, StatusEventRow>()
  if (rows.length) {
    const events = db
      .select()
      .from(schema.statusEvents)
      .where(
        inArray(
          schema.statusEvents.loadId,
          rows.map((r) => r.load.id)
        )
      )
      .orderBy(schema.statusEvents.id)
      .all()
    for (const event of events) latest.set(event.loadId, event)
  }
  return rows.map((r) => ({ ...r, lastEvent: latest.get(r.load.id) ?? null }))
}

export type StatusEventItem = {
  event: StatusEventRow
  load: Load
  tender: Tender
}

/** The 214s most recently sent, across every load. */
export function getRecentStatusEvents(limit = 20): StatusEventItem[] {
  return db
    .select({
      event: schema.statusEvents,
      load: schema.loads,
      tender: schema.tenders,
    })
    .from(schema.statusEvents)
    .innerJoin(schema.loads, eq(schema.statusEvents.loadId, schema.loads.id))
    .innerJoin(schema.tenders, eq(schema.loads.tenderId, schema.tenders.id))
    .orderBy(desc(schema.statusEvents.createdAt), desc(schema.statusEvents.id))
    .limit(limit)
    .all()
}

export type TenderDetail = {
  tender: Tender
  versions: TenderVersion[]
  responses: TenderResponse[]
  load: Load | null
  events: StatusEventRow[]
}

export function getTenderDetail(id: number): TenderDetail | null {
  const tender = db
    .select()
    .from(schema.tenders)
    .where(eq(schema.tenders.id, id))
    .get()
  if (!tender) return null
  const versions = db
    .select()
    .from(schema.tenderVersions)
    .where(eq(schema.tenderVersions.tenderId, id))
    .orderBy(schema.tenderVersions.version)
    .all()
  const responses = db
    .select()
    .from(schema.tenderResponses)
    .where(eq(schema.tenderResponses.tenderId, id))
    .orderBy(schema.tenderResponses.version)
    .all()
  const load =
    db.select().from(schema.loads).where(eq(schema.loads.tenderId, id)).get() ??
    null
  const events = load
    ? db
        .select()
        .from(schema.statusEvents)
        .where(eq(schema.statusEvents.loadId, load.id))
        .orderBy(schema.statusEvents.id)
        .all()
    : []
  return { tender, versions, responses, load, events }
}
