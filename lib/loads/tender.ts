import {
  bySuffix,
  code,
  element,
  isRecord,
  loop,
  num,
  segment,
  segments,
  str,
  withQualifier,
  x12Date,
  x12Time,
  type X12Record,
} from "@/lib/tediware/x12-json"
import { wallClockToMs, zoneOfTimeCode } from "@/lib/time-zones"

/**
 * Reading a 204 passed straight through into a `tender` block and the few
 * facts the carrier's own screens need.
 *
 * The block keeps every stop and every L11 at every level, verbatim, where
 * it arrived. Nothing here is partner-specific; a partner whose 204
 * puts something in an unusual place gets a conditional here, not a new
 * field in the block.
 */

export type Reference = {
  qualifier: string
  value: string
  description?: string
}

export type TenderStop = {
  sequence: number
  type: "pickup" | "delivery"
  reasonCode: string
  name: string
  locationCode?: string
  address: {
    line1: string
    line2?: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  references: Reference[]
  orders: { id: string; purchaseOrder?: string; references: Reference[] }[]
}

export type TenderBlock = {
  id: string
  references: Reference[]
  stops: TenderStop[]
}

export type TenderSummary = {
  /** The bill-to party (heading N1*BT): the shipper behind the partner. */
  shipperName: string | null
  shipperCode: string | null
  originName: string | null
  originCity: string | null
  originState: string | null
  destinationName: string | null
  destinationCity: string | null
  destinationState: string | null
  /** Local wall-clock, "2026-11-05T09:00". */
  pickupAt: string | null
  deliveryAt: string | null
  weight: number | null
  weightUnitCode: string | null
  handlingUnits: number | null
}

export type ParsedTender = {
  /** B2A-01: 00 original, 04 change, 01 cancel. */
  purpose: string
  /** The partner's must-respond-by (G62*64) as an ISO instant, if it set one. */
  respondBy: string | null
  tender: TenderBlock
  summary: TenderSummary
}

const PICKUP_REASONS = new Set(["LD", "CL", "PL"])
const DELIVERY_REASONS = new Set(["UL", "CU", "PU"])
// For a stop whose reason says neither (DR, a rail ramp, say), the stop's
// party (N1-01) does: who the freight leaves from or goes to.
const PICKUP_PARTIES = new Set(["SF", "SH"])
const DELIVERY_PARTIES = new Set(["ST", "CN"])

// G62 qualifiers for the start of a stop's window, most specific first.
const PICKUP_DATES = ["69", "37", "10"]
const DELIVERY_DATES = ["70", "53", "02", "68"]

export function parseTender204(document: unknown): ParsedTender {
  if (!isRecord(document)) throw new Error("The 204 is not a JSON object.")
  const heading = asRecord(bySuffix(document, "heading"))
  const detail = asRecord(bySuffix(document, "detail"))

  const id = str(element(segment(heading, "B2"), "04"))
  if (!id) throw new Error("The 204 has no shipment ID (B2-04).")
  const purpose = code(element(segment(heading, "B2A"), "01"))
  if (!purpose) throw new Error(`Tender ${id} has no purpose code (B2A-01).`)

  const stopLoops = loop(detail, "S5")
  if (stopLoops.length === 0) throw new Error(`Tender ${id} has no stops.`)
  const stops = stopLoops.map((s) => readStop(id, s))

  const pickup = stops.find((s) => s.type === "pickup")
  const delivery = stops.findLast((s) => s.type === "delivery")
  const pickupLoop = pickup && stopLoops[stops.indexOf(pickup)]
  const deliveryLoop = delivery && stopLoops[stops.indexOf(delivery)]
  const freight = segment(pickupLoop, "AT8")
  const total = segment(asRecord(bySuffix(document, "summary")), "L3")
  // Some partners give the stop's weight on S5 and its pallets in a
  // stop-level PLD instead of a stop-level AT8.
  const s5 = segment(pickupLoop, "S5")

  const billTo = withQualifier(
    loop(heading, "N1").flatMap((n) => segments(n, "N1")),
    ["BT"]
  )

  return {
    purpose,
    respondBy: respondBy(heading, pickup?.address.state),
    tender: { id, references: readReferences(heading), stops },
    summary: {
      shipperName: shipperName(str(element(billTo, "02"))),
      shipperCode: str(element(billTo, "04")) ?? null,
      originName: pickup?.name ?? null,
      originCity: pickup?.address.city ?? null,
      originState: pickup?.address.state ?? null,
      destinationName: delivery?.name ?? null,
      destinationCity: delivery?.address.city ?? null,
      destinationState: delivery?.address.state ?? null,
      pickupAt: windowStart(pickupLoop, PICKUP_DATES),
      deliveryAt: windowStart(deliveryLoop, DELIVERY_DATES),
      weight:
        num(element(freight, "03")) ??
        num(element(s5, "03")) ??
        num(element(total, "01")) ??
        null,
      weightUnitCode:
        code(element(freight, "02")) ?? code(element(s5, "04")) ?? null,
      handlingUnits:
        num(element(segment(heading, "PLD"), "01")) ??
        num(element(segment(pickupLoop, "PLD"), "01")) ??
        num(element(freight, "05")) ??
        null,
    },
  }
}

function readStop(id: string, s: X12Record): TenderStop {
  const s5 = segment(s, "S5")
  const sequence = num(element(s5, "01"))
  const reasonCode = code(element(s5, "02"))
  if (sequence === undefined || !reasonCode) {
    throw new Error(`Tender ${id} has a stop without a sequence or reason.`)
  }
  // The stop's own party is its first N1; later ones (a broker, say) are
  // extra contacts.
  const party = loop(s, "N1")[0]
  const n1 = segment(party, "N1")
  const entity = code(element(n1, "01")) ?? ""

  const type =
    PICKUP_REASONS.has(reasonCode) ||
    (!DELIVERY_REASONS.has(reasonCode) && PICKUP_PARTIES.has(entity))
      ? "pickup"
      : DELIVERY_REASONS.has(reasonCode) || DELIVERY_PARTIES.has(entity)
        ? "delivery"
        : undefined
  if (!type) {
    throw new Error(
      `Tender ${id} stop ${sequence}: unknown reason ${reasonCode}.`
    )
  }
  const n3 = segment(party, "N3")
  const n4 = segment(party, "N4")

  return {
    sequence,
    type,
    reasonCode,
    name: str(element(n1, "02")) ?? "",
    ...optional("locationCode", str(element(n1, "04"))),
    address: {
      line1: str(element(n3, "01")) ?? "",
      ...optional("line2", str(element(n3, "02"))),
      city: str(element(n4, "01")) ?? "",
      state: str(element(n4, "02")) ?? "",
      postalCode: str(element(n4, "03")) ?? "",
      country: code(element(n4, "04")) ?? "",
    },
    references: readReferences(s),
    orders: loop(s, "OID").map((o) => {
      const oid = segment(o, "OID")
      return {
        id: str(element(oid, "01")) ?? "",
        ...optional("purchaseOrder", str(element(oid, "02"))),
        references: readReferences(o),
      }
    }),
  }
}

function readReferences(container: X12Record | undefined): Reference[] {
  return segments(container, "L11").flatMap((l11) => {
    const value = str(element(l11, "01"))
    const qualifier = code(element(l11, "02"))
    if (!value || !qualifier) return []
    return [
      { qualifier, value, ...optional("description", str(element(l11, "03"))) },
    ]
  })
}

/**
 * The heading's G62*64, as an instant. Read from its digits, so punctuated
 * forms ("2026-12-01", "10:46") work as well as X12's. LT is read as the
 * first pickup's local time.
 */
function respondBy(
  heading: X12Record | undefined,
  originState: string | undefined
): string | null {
  const g62 = withQualifier(segments(heading, "G62"), ["64"])
  const date = x12Date(str(element(g62, "02"))?.replace(/-/g, ""))
  const time = str(element(g62, "04"))?.replace(/\D/g, "")
  const zone = zoneOfTimeCode(code(element(g62, "05")), originState)
  if (!date || !time || time.length < 4 || !zone) return null
  const ms = wallClockToMs(
    `${date}T${time.slice(0, 2)}:${time.slice(2, 4)}`,
    zone
  )
  return ms === null ? null : new Date(ms).toISOString()
}

function windowStart(
  stop: X12Record | undefined,
  qualifiers: string[]
): string | null {
  const g62 = withQualifier(segments(stop, "G62"), qualifiers)
  const date = x12Date(element(g62, "02"))
  if (!date) return null
  const time = x12Time(element(g62, "04"))
  return time ? `${date}T${time}` : date
}

/**
 * A 3PL tendering for a shipper may bill to "<SHIPPER> c/o <3PL>"; the
 * shipper is the part before.
 */
function shipperName(billTo: string | undefined): string | null {
  return billTo?.replace(/\s+c\/o\s.*$/i, "").trim() || null
}

function asRecord(value: unknown): X12Record | undefined {
  return isRecord(value) ? value : undefined
}

/** `{key: value}` when the value is present, `{}` otherwise. */
function optional<K extends string>(
  key: K,
  value: string | undefined
): { [P in K]?: string } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: string }
}
