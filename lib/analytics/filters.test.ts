import assert from "node:assert/strict"
import { test } from "node:test"

import { filtersHref, parseFilters, shipperKey, toggleShipper } from "./filters"

test("parseFilters defaults to 30 days with every shipper shown", () => {
  const f = parseFilters({})
  assert.equal(f.period.value, "30d")
  assert.deepEqual(f.hiddenShippers, [])
  assert.equal(parseFilters({ period: "nonsense" }).period.value, "30d")
})

test("filters survive a round trip through the URL", () => {
  const f = parseFilters({
    period: "all",
    hide: ["ACME:NW", "GLOBEX:BT0012", "ACME:NW"],
  })
  assert.deepEqual(f.hiddenShippers, ["ACME:NW", "GLOBEX:BT0012"])
  const href = filtersHref(f)
  const params = new URL(href, "http://x").searchParams
  assert.deepEqual(
    parseFilters({
      period: params.get("period")!,
      hide: params.getAll("hide"),
    }),
    f
  )
})

test("toggleShipper hides and shows again", () => {
  const key = shipperKey("ACME", "NW")
  const hidden = toggleShipper(parseFilters({}), key)
  assert.deepEqual(hidden.hiddenShippers, [key])
  assert.deepEqual(toggleShipper(hidden, key).hiddenShippers, [])
  assert.equal(shipperKey("GLOBEX", null), "GLOBEX:")
})
