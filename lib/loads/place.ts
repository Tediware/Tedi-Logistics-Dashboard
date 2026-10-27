import { nearestPostal, stateOfPostal } from "@/lib/geo/postal"

import type { EventLocation, ParsedEvent } from "./status"
import type { TenderStop } from "./tender"

// Status and appointment codes that are about the pickup or the delivery.
const PICKUP_CODES = new Set(["X3", "AF", "AA", "CP"])
const DELIVERY_CODES = new Set(["X1", "D1", "AB", "AG"])

/**
 * A 214 event's place, filled in where the 214 leaves it out. Its state
 * matters most: an event's local time, and an LT time code, can only be
 * read once the state is known.
 *
 * A reported position gives the state of the postal code it falls in. An
 * event at a stop takes the stop's city and state, the stop found from the
 * 214's stop number or from what the code is about. A position report (X6)
 * is never given a stop's city: the truck is not there.
 */
export function placeEvent(
  event: ParsedEvent,
  stopSequence: number | null,
  stops: TenderStop[]
): EventLocation {
  const location = { ...event.location }
  if (location.state) return location

  if (location.coordinates) {
    const { latitude, longitude } = location.coordinates
    const postal = nearestPostal([longitude, latitude])
    const state = postal && stateOfPostal(postal.country, postal.code)
    if (state) {
      location.state = state
      location.country ??= postal.country
    }
  }
  if (event.code === "X6") return location

  const stop =
    (stopSequence !== null
      ? stops.find((s) => s.sequence === stopSequence)
      : undefined) ??
    (PICKUP_CODES.has(event.code)
      ? stops.find((s) => s.type === "pickup")
      : DELIVERY_CODES.has(event.code)
        ? stops.findLast((s) => s.type === "delivery")
        : undefined)
  if (!stop) return location
  return {
    ...location,
    city: location.city ?? stop.address.city,
    state: location.state ?? stop.address.state,
    country: location.country ?? stop.address.country,
  }
}
