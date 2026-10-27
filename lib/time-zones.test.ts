import assert from "node:assert/strict"
import { test } from "node:test"

import {
  stopTimeToMs,
  wallClockToMs,
  zoneOfState,
  zoneOfTimeCode,
} from "./time-zones"

test("zoneOfState covers states and provinces", () => {
  assert.equal(zoneOfState("ny"), "America/New_York")
  assert.equal(zoneOfState("ON"), "America/Toronto")
  assert.equal(zoneOfState("ZZ"), null)
  assert.equal(zoneOfState(null), null)
})

test("wallClockToMs reads a local time in its zone", () => {
  // EDT before the change, EST after it.
  assert.equal(
    new Date(
      wallClockToMs("2026-10-30T09:00", "America/New_York")!
    ).toISOString(),
    "2026-10-30T13:00:00.000Z"
  )
  assert.equal(
    new Date(
      wallClockToMs("2026-11-05T09:00", "America/New_York")!
    ).toISOString(),
    "2026-11-05T14:00:00.000Z"
  )
  assert.equal(
    new Date(
      wallClockToMs("2026-11-05T09:00", "America/Phoenix")!
    ).toISOString(),
    "2026-11-05T16:00:00.000Z"
  )
  assert.equal(wallClockToMs("not a time", "America/Chicago"), null)
})

test("stopTimeToMs needs a known state", () => {
  assert.equal(
    new Date(stopTimeToMs("2026-11-06T08:00", "IL")!).toISOString(),
    "2026-11-06T14:00:00.000Z"
  )
  assert.equal(stopTimeToMs("2026-11-06T08:00", null), null)
})

test("zoneOfTimeCode reads X12 time codes, LT by the place", () => {
  assert.equal(zoneOfTimeCode("ET"), "America/New_York")
  assert.equal(zoneOfTimeCode("cd"), "Etc/GMT+5")
  assert.equal(zoneOfTimeCode("LT", "AZ"), "America/Phoenix")
  assert.equal(zoneOfTimeCode("LT"), null)
  assert.equal(zoneOfTimeCode("ZZ"), null)
  assert.equal(zoneOfTimeCode(undefined), null)
})
