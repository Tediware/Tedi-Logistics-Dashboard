import assert from "node:assert/strict"
import { test } from "node:test"

import { arc, arcPoint } from "./arc"
import {
  nearestPostal,
  postalCentroid,
  postalKey,
  stateOfPostal,
} from "./postal"

test("postalKey reads ZIP+4 as its ZIP and Canadian codes as their FSA", () => {
  assert.deepEqual(postalKey("12302-1234", "USA"), {
    country: "US",
    code: "12302",
  })
  assert.deepEqual(postalKey("n2v 1a2", "CAN"), { country: "CA", code: "N2V" })
  assert.deepEqual(postalKey("N2V1A2", "CA"), { country: "CA", code: "N2V" })
  assert.equal(postalKey("12302", "MEX"), null)
  assert.equal(postalKey("", "USA"), null)
})

test("postalCentroid returns [lng, lat]", () => {
  const [lng, lat] = postalCentroid("12302", "USA")!
  assert.ok(lat > 42 && lat < 43.5, `lat ${lat}`)
  assert.ok(lng > -74.5 && lng < -73.5, `lng ${lng}`)
  assert.ok(postalCentroid("N2V 1A2", "CAN"))
  assert.equal(postalCentroid("00000", "USA"), null)
})

test("arcs start and end at their stops and bow left of travel", () => {
  const from: [number, number] = [0, 0]
  const to: [number, number] = [10, 0]
  const line = arc(from, to, 10)
  assert.deepEqual(line[0], from)
  assert.deepEqual(line[10], to)
  // Travelling east, left is north.
  assert.ok(arcPoint(from, to, 0.5)[1] > 0)
  assert.ok(arcPoint(to, from, 0.5)[1] < 0)
})

test("stateOfPostal reads a ZIP prefix or an FSA's first letter", () => {
  assert.equal(stateOfPostal("US", "12302"), "NY")
  assert.equal(stateOfPostal("US", "60426"), "IL")
  assert.equal(stateOfPostal("US", "88510"), "TX")
  assert.equal(stateOfPostal("CA", "N2V"), "ON")
  assert.equal(stateOfPostal("US", "00000"), null)
})

test("nearestPostal finds the code a position falls in", () => {
  // Downtown Cleveland.
  const near = nearestPostal([-81.69, 41.5])!
  assert.equal(near.country, "US")
  assert.equal(stateOfPostal(near.country, near.code), "OH")
})
