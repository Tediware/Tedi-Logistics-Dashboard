import assert from "node:assert/strict"
import { test } from "node:test"

import { transactionSetOf, usageIndicatorOf, type FeedEntry } from "./feed"

const entry = (detail: FeedEntry["detail"]): FeedEntry => ({
  id: "e1",
  direction: "outbound",
  status: "success",
  createdAt: "2026-10-22T00:18:15.804Z",
  partnerKey: "ACME",
  traceGuid: null,
  resultId: null,
  detail,
})

const identified = (code: string) =>
  entry({ x12: { transaction: { transactionSetIdentifier: code } } })

test("reads the transaction set from either identifier", () => {
  assert.equal(transactionSetOf(identified("214")), "214")
  assert.equal(transactionSetOf(identified("QM")), "214")
  assert.equal(transactionSetOf(identified("GF")), "990")
  assert.equal(transactionSetOf(identified("810")), "810")
  assert.equal(transactionSetOf(entry({})), null)
})

test("reads the usage indicator from the entry or its interchange", () => {
  assert.equal(usageIndicatorOf(entry({ usageIndicator: "T" })), "T")
  assert.equal(
    usageIndicatorOf(
      entry({ x12: { interchange: { usageIndicatorCode: "P" } } })
    ),
    "P"
  )
  assert.equal(usageIndicatorOf(entry({})), null)
})
