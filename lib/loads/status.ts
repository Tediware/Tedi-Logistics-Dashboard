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

/**
 * Reading a 214 the carrier sent, in its X12 shape, into the events it
 * reports. One 214 can carry several AT7s; each becomes an event.
 *
 * Partners ask for different things on a 214: some want the city and state
 * on MS1, some want coordinates, some a stop number in an L11. All of it is
 * read when present, and nothing is required beyond a code, a date and a
 * time. Filling a missing place in from the tender is the store's job.
 */

export type Coordinates = { latitude: number; longitude: number }

export type EventLocation = {
  city?: string
  state?: string
  country?: string
  /** Decimal degrees, negative west and south. */
  coordinates?: Coordinates
}

export type ParsedEvent = {
  type: "status" | "appointment"
  /** AT7-01 for a status, AT7-03 for an appointment. */
  code: string
  reasonCode: string | null
  /** "2026-11-05" */
  date: string
  /** "09:12" */
  time: string
  /** AT7-07; null means local time at the event's place. */
  timeCode: string | null
  location: EventLocation
}

export type ParsedStatus = {
  /** B10-02: the partner's shipment ID, the tender this load came from. */
  shipmentId: string
  /** B10-01: the carrier's own reference, its load number. */
  loadNumber: string | null
  /** The stop the 214 is about (L11*QN), when it says. */
  stopSequence: number | null
  events: ParsedEvent[]
}

export function parse214(document: unknown): ParsedStatus {
  if (!isRecord(document)) throw new Error("The 214 is not a JSON object.")
  const heading = asRecord(bySuffix(document, "heading"))
  const detail = asRecord(bySuffix(document, "detail"))
  const b10 = segment(heading, "B10")

  const shipmentId = str(element(b10, "02"))
  if (!shipmentId) throw new Error("The 214 has no shipment ID (B10-02).")

  const stop = withQualifier(segments(heading, "L11"), ["QN"], "02")
  // The LX loop sits in the heading or the detail, by implementation.
  const lxLoops = [...loop(heading, "LX"), ...loop(detail, "LX")]
  const events = lxLoops
    .flatMap((lx) => loop(lx, "AT7"))
    .flatMap((at7Loop) => {
      const event = readEvent(at7Loop)
      return event ? [event] : []
    })
  if (events.length === 0) {
    throw new Error(`214 for ${shipmentId} has no AT7 with a date and time.`)
  }

  return {
    shipmentId,
    loadNumber: str(element(b10, "01")) ?? null,
    stopSequence: num(element(stop, "01")) ?? null,
    events,
  }
}

function readEvent(at7Loop: X12Record): ParsedEvent | null {
  const at7 = segment(at7Loop, "AT7")
  const status = code(element(at7, "01"))
  const appointment = code(element(at7, "03"))
  const date = x12Date(element(at7, "05"))
  const time = x12Time(element(at7, "06"))
  if ((!status && !appointment) || !date || !time) return null

  return {
    type: status ? "status" : "appointment",
    code: (status ?? appointment)!,
    reasonCode: code(element(at7, status ? "02" : "04")) ?? null,
    date,
    time,
    timeCode: code(element(at7, "07")) ?? null,
    location: readLocation(segment(at7Loop, "MS1")),
  }
}

function readLocation(ms1: X12Record | undefined): EventLocation {
  const location: EventLocation = {}
  const city = str(element(ms1, "01"))
  const state = code(element(ms1, "02"))
  const country = code(element(ms1, "03"))
  if (city) location.city = city
  if (state) location.state = state
  if (country) location.country = country

  const longitude = degrees(str(element(ms1, "04")), code(element(ms1, "06")))
  const latitude = degrees(str(element(ms1, "05")), code(element(ms1, "07")))
  if (latitude !== null && longitude !== null) {
    location.coordinates = { latitude, longitude }
  }
  return location
}

/**
 * MS1 coordinates are DDDMMSS (degrees, minutes, seconds) with a separate
 * direction, W and S being negative.
 */
export function degrees(
  value: string | undefined,
  direction: string | undefined
): number | null {
  if (!value || !/^\d{6,7}$/.test(value)) return null
  const padded = value.padStart(7, "0")
  const d = Number(padded.slice(0, 3))
  const m = Number(padded.slice(3, 5))
  const s = Number(padded.slice(5, 7))
  if (m > 59 || s > 59 || d > 180) return null
  const decimal = d + m / 60 + s / 3600
  const negative = direction === "W" || direction === "S"
  return Math.round((negative ? -decimal : decimal) * 1e5) / 1e5
}

function asRecord(value: unknown): X12Record | undefined {
  return isRecord(value) ? value : undefined
}
