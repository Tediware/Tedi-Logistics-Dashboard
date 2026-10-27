import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { placeEvent } from "./place"
import { parse990 } from "./response"
import { degrees, parse214 } from "./status"
import { parseTender204 } from "./tender"

const fixture = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8")
  )

describe("parse990", () => {
  it("reads the tender, the answer and the load number", () => {
    assert.deepEqual(parse990(fixture("990-accept.json")), {
      shipmentId: "K31400033",
      code: "A",
      loadNumber: "L51005",
      date: "2026-11-02",
      declineReason: null,
    })
  })

  it("reads a decline's reason and refuses an unknown action", () => {
    const doc = fixture("990-accept.json")
    const b1 = doc.heading.beginning_segment_for_booking_or_pick_up_delivery_B1
    b1.reservation_action_code_04 = "D"
    doc.heading.remarks_K1 = { free_form_message_01: "NO CAPACITY" }
    assert.equal(parse990(doc).declineReason, "NO CAPACITY")
    b1.reservation_action_code_04 = "X"
    assert.throws(() => parse990(doc), /B1-04/)
  })
})

describe("parse214", () => {
  it("reads every AT7, with its stop number and place", () => {
    const parsed = parse214(fixture("214-delivered.json"))
    assert.equal(parsed.shipmentId, "K31400033")
    assert.equal(parsed.loadNumber, "L51005")
    assert.equal(parsed.stopSequence, 2)
    assert.deepEqual(
      parsed.events.map((e) => [e.code, e.date, e.time, e.timeCode]),
      [
        ["X1", "2026-11-06", "07:42", null],
        ["D1", "2026-11-06", "09:30", null],
      ]
    )
    assert.deepEqual(parsed.events[0].location, {
      city: "HARVEY",
      state: "IL",
      country: "US",
    })
  })

  it("reads coordinates as decimal degrees", () => {
    const [ping] = parse214(fixture("214-position.json")).events
    assert.equal(ping.code, "X6")
    assert.deepEqual(ping.location, {
      coordinates: { latitude: 41.49917, longitude: -81.92444 },
    })
    assert.equal(degrees("0354156", "N"), 35.69889)
    assert.equal(degrees("0996000", "W"), null)
  })

  it("refuses a 214 with no usable AT7", () => {
    const doc = fixture("214-position.json")
    const at7 =
      doc.heading.assigned_number_LX_loop[0].shipment_status_details_AT7_loop[0]
        .shipment_status_details_AT7
    at7.time_06 = "2575"
    assert.throws(() => parse214(doc), /no AT7/)
  })
})

describe("placeEvent", () => {
  const { stops } = parseTender204(fixture("204-pass-through.json")).tender

  it("gives an event at a stop the stop's city and state", () => {
    const parsed = parse214(fixture("214-delivered.json"))
    assert.deepEqual(placeEvent(parsed.events[1], 2, stops), {
      city: "HARVEY",
      state: "IL",
      country: "USA",
    })
  })

  it("places a ping by its position, never at a stop", () => {
    const [ping] = parse214(fixture("214-position.json")).events
    const location = placeEvent(ping, null, stops)
    assert.equal(location.state, "OH")
    assert.equal(location.city, undefined)
  })
})
