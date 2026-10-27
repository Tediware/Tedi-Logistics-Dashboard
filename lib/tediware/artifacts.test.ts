import assert from "node:assert/strict"
import { test } from "node:test"

import { candidateArtifacts, isX12Shaped } from "./artifacts"
import type { FeedEntry } from "./feed"

const entry = (
  direction: FeedEntry["direction"],
  artifacts: NonNullable<FeedEntry["detail"]>["artifacts"]
): FeedEntry => ({
  id: "e1",
  direction,
  status: "success",
  createdAt: "2026-10-22T00:18:15.804Z",
  partnerKey: "ACME",
  traceGuid: null,
  resultId: null,
  detail: { artifacts },
})

test("inbound reads the JSON output", () => {
  const picked = candidateArtifacts(
    entry("inbound", [
      { id: "edi", usage: "input", contentType: "application/edi-x12" },
      { id: "json", usage: "output", contentType: "application/json" },
    ])
  )
  assert.deepEqual(
    picked.map((a) => a.id),
    ["json"]
  )
})

test("outbound tries the mapped JSON before the submitted JSON", () => {
  const picked = candidateArtifacts(
    entry("outbound", [
      { id: "submitted", usage: "input", contentType: "application/json" },
      { id: "mapped", usage: "input", contentType: "application/json" },
      { id: "edi", usage: "output", contentType: "application/edi-x12" },
    ])
  )
  assert.deepEqual(
    picked.map((a) => a.id),
    ["mapped", "submitted"]
  )
})

test("isX12Shaped wants a heading section", () => {
  assert.equal(
    isX12Shaped({ heading: { transaction_set_header_ST: {} } }),
    true
  )
  assert.equal(isX12Shaped({ carrier: { scac: "CRRX" } }), false)
  assert.equal(isX12Shaped([]), false)
})
