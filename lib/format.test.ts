import assert from "node:assert/strict"
import { test } from "node:test"

import {
  formatRelative,
  formatSpan,
  formatTime,
  formatWallClock,
} from "./format"

test("formatTime shows an instant in the app's zone", () => {
  assert.equal(formatTime("2026-11-03T20:07:00Z"), "Tue, Nov 3, 14:07")
  assert.equal(formatTime(null), "-")
})

test("formatWallClock shows a document's local time as given", () => {
  assert.equal(formatWallClock("2026-11-05T09:00"), "Thu, Nov 5, 09:00")
  assert.equal(formatWallClock("2026-11-05"), "Thu, Nov 5")
})

test("formatSpan and formatRelative are coarse", () => {
  assert.equal(formatSpan(45 * 60_000), "45 min")
  assert.equal(formatSpan(190 * 60_000), "3h 10m")
  assert.equal(formatSpan(51 * 3_600_000), "2d 3h")
  assert.equal(formatRelative(3_600_000, 0), "in 1h")
  assert.equal(formatRelative(0, 600_000), "10 min ago")
})
