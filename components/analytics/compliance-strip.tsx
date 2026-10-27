"use client"

import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  TriangleAlert,
} from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type {
  ComplianceMetric,
  ComplianceStatus,
} from "@/lib/analytics/compliance"
import { cn } from "@/lib/utils"

// Status colors are the same in both themes, and always travel with an
// icon and a label, never color alone.
const STATUS: Record<
  ComplianceStatus,
  { color: string; icon: typeof CircleCheck; label: string }
> = {
  good: { color: "#0ca30c", icon: CircleCheck, label: "Meeting goal" },
  warning: { color: "#fab219", icon: TriangleAlert, label: "Below goal" },
  critical: { color: "#d03b3b", icon: CircleAlert, label: "Well below goal" },
  none: { color: "#8a8a85", icon: CircleMinus, label: "Nothing to measure" },
}

const percent = (rate: number | null) =>
  rate === null ? "–" : `${Math.round(rate * 100)}%`

/** The four compliance rates, each a meter that opens its detail on hover. */
export function ComplianceStrip({ metrics }: { metrics: ComplianceMetric[] }) {
  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-1">
      {metrics.map((m) => (
        <MetricChip key={m.key} metric={m} />
      ))}
    </div>
  )
}

function MetricChip({ metric: m }: { metric: ComplianceMetric }) {
  const status = STATUS[m.status]
  const Icon = status.icon
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={100}
        render={<Button variant="ghost" size="lg" className="gap-2 px-2" />}
        aria-label={`${m.label}: ${percent(m.rate)} on time, ${status.label.toLowerCase()}`}
      >
        <Icon className="size-3.5" style={{ color: status.color }} />
        <span className="font-normal text-muted-foreground">{m.label}</span>
        <span className="text-sm font-semibold">{percent(m.rate)}</span>
        <Meter rate={m.rate} goal={m.goal} color={status.color} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <Detail metric={m} />
      </PopoverContent>
    </Popover>
  )
}

/**
 * A ratio against a limit: the fill carries the status, the track is a
 * lighter step of the same color, and a tick marks the goal.
 */
function Meter({
  rate,
  goal,
  color,
  className,
}: {
  rate: number | null
  goal: number
  color: string
  className?: string
}) {
  return (
    <span
      className={cn("relative h-1.5 w-12 rounded-full", className)}
      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)` }}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${(rate ?? 0) * 100}%`, background: color }}
      />
      <span
        className="absolute -inset-y-0.5 w-px bg-foreground/70"
        style={{ left: `${goal * 100}%` }}
      />
    </span>
  )
}

function Detail({ metric: m }: { metric: ComplianceMetric }) {
  const status = STATUS[m.status]
  const Icon = status.icon
  return (
    <>
      <div className="space-y-1">
        <div className="text-sm font-medium">{m.label}</div>
        <p className="text-muted-foreground">{m.rule}</p>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{percent(m.rate)}</div>
          <div className="text-muted-foreground tabular-nums">
            {m.onTime} of {m.total} on time
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" style={{ color: status.color }} />
          {status.label} ({Math.round(m.goal * 100)}%)
        </div>
      </div>

      {m.daily.length > 0 && <DailyChart metric={m} />}

      {m.byPartner.length > 0 && (
        <div className="space-y-1.5">
          {m.byPartner.map((p) => {
            const rate = p.total ? p.onTime / p.total : null
            return (
              <div key={p.name} className="flex items-center gap-2">
                <span className="w-16 truncate">{p.name}</span>
                <Meter
                  rate={rate}
                  goal={m.goal}
                  color={STATUS[p.status].color}
                  className="flex-1"
                />
                <span className="w-9 text-right font-medium tabular-nums">
                  {percent(rate)}
                </span>
                <span className="w-16 text-right text-muted-foreground tabular-nums">
                  {p.onTime}/{p.total}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {m.facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2">
          {m.facts.map((f) => (
            <React.Fragment key={f.label}>
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="text-right tabular-nums">{f.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
    </>
  )
}

/**
 * On-time share per day, one column each on a 0–100% scale with the goal as
 * a dashed rule. Days with nothing to measure leave a gap rather than a zero.
 * Hovering a column names its day in the caption.
 */
function DailyChart({ metric: m }: { metric: ComplianceMetric }) {
  const [active, setActive] = React.useState<number | null>(null)
  const day = active === null ? null : m.daily[active]
  return (
    <div className="space-y-1">
      <div
        className="relative flex h-16 items-end gap-0.5"
        onMouseLeave={() => setActive(null)}
      >
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/40"
          style={{ bottom: `${m.goal * 100}%` }}
        />
        {m.daily.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setActive(i)}
          >
            {d.total > 0 && (
              <div
                className={cn(
                  "w-full rounded-t-[2px] bg-foreground/45 transition-colors",
                  active === i && "bg-foreground"
                )}
                style={{
                  height: `${Math.max(2, (d.onTime / d.total) * 100)}%`,
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-muted-foreground tabular-nums">
        {day ? (
          <span>
            {day.label}:{" "}
            {day.total
              ? `${day.onTime} of ${day.total} on time (${percent(day.onTime / day.total)})`
              : "nothing to measure"}
          </span>
        ) : (
          <>
            <span>{m.daily[0].label}</span>
            <span>Daily, dashed line {Math.round(m.goal * 100)}% goal</span>
            <span>{m.daily.at(-1)!.label}</span>
          </>
        )}
      </div>
    </div>
  )
}
