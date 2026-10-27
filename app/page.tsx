import Link from "next/link"

import { ControlBar } from "@/components/analytics/control-bar"
import { GeoMap } from "@/components/analytics/geo-map"
import { AutoRefresh } from "@/components/auto-refresh"
import { getCompliance } from "@/lib/analytics/compliance"
import { parseFilters } from "@/lib/analytics/filters"
import { getGeoPicture } from "@/lib/analytics/geo"
import { getShippers } from "@/lib/analytics/scope"
import { requestNow } from "@/lib/clock"
import { isApiConfigured } from "@/lib/tediware"

export const dynamic = "force-dynamic"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseFilters(await searchParams)
  const now = requestNow()
  const shippers = getShippers(filters, now)
  const geo = getGeoPicture({ filters, now })
  const compliance = getCompliance({ filters, now })
  const allHidden =
    shippers.length > 0 &&
    shippers.every((s) => filters.hiddenShippers.includes(s.key))

  const summary = allHidden
    ? "Every shipper is hidden"
    : [
        plural(geo.tenders, "tender"),
        plural(geo.lanes.length, "lane"),
        plural(geo.facilities.length, "facility", "facilities"),
        `${geo.trucks.length} on the road`,
      ].join(" · ")

  // data-full-width lifts the layout's width limit for this page.
  return (
    <div data-full-width className="space-y-3">
      <AutoRefresh seconds={10} />
      {shippers.length === 0 && <GettingStarted />}
      <ControlBar
        filters={filters}
        shippers={shippers}
        compliance={compliance}
        summary={summary}
      />
      <GeoMap data={geo} />
    </div>
  )
}

/** Shown until the first tender has been synced. */
function GettingStarted() {
  const link = "underline underline-offset-4 hover:text-foreground"
  return (
    <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      {isApiConfigured() ? (
        <>
          No tenders yet. The first sync reads up to 45 days of documents from
          Tediware; follow it on{" "}
          <Link href="/activity" className={link}>
            Activity
          </Link>
          .
        </>
      ) : (
        <>
          Not connected to Tediware. Create a read-only API key in your Tediware
          account, set it as <code>TEDIWARE_API_KEY</code> in{" "}
          <code>.env.local</code>, and restart the app.
        </>
      )}
    </div>
  )
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
