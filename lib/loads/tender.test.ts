import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"

import { parseTender204 } from "./tender"

// A 204 as Tediware delivers it from a flow that passes the X12 straight
// through, so code values arrive labelled.
const delivered = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "fixtures/204-pass-through.json"),
    "utf8"
  )
)

describe("parseTender204", () => {
  const { purpose, tender, summary } = parseTender204(delivered)

  it("reads the tender ID and purpose", () => {
    assert.equal(tender.id, "K31400033")
    assert.equal(purpose, "00")
  })

  it("keeps every stop with its partner codes and address", () => {
    assert.deepEqual(
      tender.stops.map((s) => [s.sequence, s.type, s.reasonCode]),
      [
        [1, "pickup", "CL"],
        [2, "delivery", "CU"],
      ]
    )
    assert.deepEqual(tender.stops[0].address, {
      line1: "100 INDUSTRIAL WAY",
      line2: "DOOR 4",
      city: "SCHENECTADY",
      state: "NY",
      postalCode: "12302",
      country: "USA",
    })
    assert.equal(tender.stops[1].locationCode, "USILH")
  })

  it("captures references verbatim and at the level they arrived", () => {
    assert.deepEqual(tender.references, [])
    assert.equal(tender.stops[0].references.length, 8)
    assert.equal(tender.stops[1].references.length, 4)
    assert.deepEqual(tender.stops[0].references[2], {
      qualifier: "BM",
      value: "615857183",
      description: "BOL",
    })
    assert.deepEqual(tender.stops[0].references[3], {
      qualifier: "DO",
      value: "0071451488",
      description: "Customer Reference Number",
    })
    assert.deepEqual(tender.stops[0].orders, [
      { id: "LSP300000898713", purchaseOrder: "4500389858", references: [] },
    ])
  })

  it("summarises the shipper, lane, window and freight", () => {
    assert.deepEqual(summary, {
      shipperName: "NORTHWIND HOME GOODS",
      shipperCode: "BT0047712",
      originName: "EXAMPLE CONTRACT PACKAGING",
      originCity: "SCHENECTADY",
      originState: "NY",
      destinationName: "NORTHWIND HOME GOODS - HARVEY",
      destinationCity: "HARVEY",
      destinationState: "IL",
      pickupAt: "2026-11-05T09:00",
      deliveryAt: "2026-11-06T08:00",
      weight: 14878.65,
      weightUnitCode: "L",
      handlingUnits: 34,
    })
  })

  it("has no respond-by when the partner sets none", () => {
    assert.equal(parseTender204(delivered).respondBy, null)
  })

  it("reads a respond-by in either date and time shape", () => {
    const withDeadline = (date: string, time: string) => {
      const doc = structuredClone(delivered)
      const key = Object.keys(doc).find((k) => k.endsWith("heading"))!
      doc[key].date_time_G62 = {
        date_qualifier_01: "must_respond_by_64",
        date_02: date,
        time_qualifier_03: "must_respond_by_1",
        time_04: time,
        time_code_05: "eastern_time_ET",
      }
      return parseTender204(doc).respondBy
    }
    assert.equal(withDeadline("20261201", "1046"), "2026-12-01T15:46:00.000Z")
    assert.equal(
      withDeadline("2026-12-01", "10:46"),
      "2026-12-01T15:46:00.000Z"
    )
    assert.equal(withDeadline("2026-13-01", "1046"), null)
  })

  it("types a stop by its party when the reason says neither", () => {
    const doc = structuredClone(delivered)
    doc.detail.stop_off_details_S5_loop[1].stop_off_details_S5.stop_reason_code_02 =
      "deramp_and_ramp_for_subsequent_loading_DR"
    const { tender } = parseTender204(doc)
    assert.deepEqual(
      [tender.stops[1].type, tender.stops[1].reasonCode],
      ["delivery", "DR"]
    )
  })

  it("rejects a document with no shipment ID", () => {
    assert.throws(() => parseTender204({ heading: {} }), /B2-04/)
  })
})
