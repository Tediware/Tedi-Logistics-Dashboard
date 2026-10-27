import Link from "next/link"

import { ComplianceStrip } from "@/components/analytics/compliance-strip"
import { ShipperPicker } from "@/components/analytics/shipper-picker"
import type { ComplianceMetric } from "@/lib/analytics/compliance"
import {
  filtersHref,
  PERIODS,
  type AnalyticsFilters,
} from "@/lib/analytics/filters"
import type { ShipperOption } from "@/lib/analytics/scope"
import { cn } from "@/lib/utils"

/**
 * The page title and the filters every panel shares, over a full-width
 * strip of compliance rates and what the filters select. Each period is a
 * link to the page with that period, so the URL always describes what is on
 * screen.
 */
export function ControlBar({
  filters,
  shippers,
  compliance,
  summary,
}: {
  filters: AnalyticsFilters
  shippers: ShipperOption[]
  compliance: ComplianceMetric[]
  summary: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-2 text-lg font-semibold tracking-tight">
          Compliance
        </h1>
        <div className="flex h-8 items-center rounded-md border p-0.5 text-xs">
          {PERIODS.map((p) => (
            <Link
              key={p.value}
              href={filtersHref({ ...filters, period: p })}
              scroll={false}
              className={cn(
                "flex h-full items-center rounded px-2.5 text-muted-foreground transition-colors hover:text-foreground",
                p.value === filters.period.value &&
                  "bg-muted font-medium text-foreground"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <ShipperPicker filters={filters} shippers={shippers} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/50 px-2 py-1">
        <ComplianceStrip metrics={compliance} />
        <p className="ml-auto px-2 text-sm text-muted-foreground tabular-nums">
          {summary}
        </p>
      </div>
    </div>
  )
}
