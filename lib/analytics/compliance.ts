import "server-only"

import { and, eq, gte, inArray } from "drizzle-orm"

import { titleCase } from "@/components/loads"
import { db, schema } from "@/db"
import { formatSpan } from "@/lib/format"
import { site } from "@/lib/site"
import { wallClockToMs, zoneOfTimeCode } from "@/lib/time-zones"

import type { AnalyticsFilters } from "./filters"
import { tenderScope } from "./scope"

/**
 * How well the carrier keeps its side of the exchange: answering tenders in
 * time (990), reporting pickups and deliveries promptly (214), and pinging
 * position while loads move (X6). Each metric is the share of observations
 * that met its rule, in the selected period and for the shown shippers.
 *
 * The rules are the carrier's own targets, gathered here so they are easy
 * to find and change. A partner's respond-by on the 204 always wins over
 * the default response window.
 */
export const RULES = {
  /** Share on time that counts as meeting a metric. */
  goal: 0.95,
  /** Below the goal but at least this share is a warning, not critical. */
  warning: 0.85,
  /** Answer window when the 204 sets no respond-by (G62*64). */
  responseMinutes: 60,
  /** Longest a pickup or delivery 214 may follow the event it reports. */
  milestoneMinutes: 60,
  /** Longest gap between position updates while a load is in transit. */
  pingMinutes: 30,
}

export type ComplianceStatus = "good" | "warning" | "critical" | "none"

export type ComplianceMetric = {
  key: "response" | "pickup" | "delivery" | "pings"
  label: string
  /** The rule in words. */
  rule: string
  onTime: number
  total: number
  rate: number | null
  status: ComplianceStatus
  goal: number
  facts: { label: string; value: string }[]
  byPartner: {
    name: string
    onTime: number
    total: number
    status: ComplianceStatus
  }[]
  /** One entry per day of the period, in the app's zone. */
  daily: { day: string; label: string; onTime: number; total: number }[]
}

type Observation = {
  partner: string
  /** When it counts, for the period and the day it lands on. */
  at: number
  ok: boolean
  /** The measured time, in minutes, for the typical and worst facts. */
  minutes: number | null
}

const MINUTE = 60_000
const PICKUP = ["X3", "AF"]
const DELIVERY = ["X1", "D1"]

export function getCompliance(options: {
  filters: AnalyticsFilters
  now: number
}): ComplianceMetric[] {
  const { filters, now } = options
  const since = filters.period.days
    ? now - filters.period.days * 24 * 60 * MINUTE
    : null
  const inPeriod = (o: Observation) => since === null || o.at >= since
  const scope = tenderScope(filters, now, { period: false })

  const responses = responseObservations(scope, now).filter(inPeriod)
  const milestones = milestoneObservations(scope, since)
  const pings = pingObservations(scope, now).filter(inPeriod)

  const range = { since, now }
  return [
    metric(range, responses, {
      key: "response",
      label: "990 response",
      rule: `Answered by the partner's respond-by, or within ${RULES.responseMinutes} minutes of the 204 when it sets none.`,
      facts: (obs) => [
        typical(obs, "Median response"),
        worst(obs, "Slowest"),
        {
          label: "Never answered",
          value: String(obs.filter((o) => o.minutes === null).length),
        },
      ],
    }),
    metric(
      range,
      milestones.filter((m) => PICKUP.includes(m.code)),
      {
        key: "pickup",
        label: "Pickup 214s",
        rule: `Arrived at (X3) and departed (AF) pickup, sent within ${RULES.milestoneMinutes} minutes of the event.`,
        facts: (obs) => [typical(obs, "Median delay"), worst(obs, "Latest")],
      }
    ),
    metric(
      range,
      milestones.filter((m) => DELIVERY.includes(m.code)),
      {
        key: "delivery",
        label: "Delivery 214s",
        rule: `Arrived at (X1) and delivered (D1), sent within ${RULES.milestoneMinutes} minutes of the event.`,
        facts: (obs) => [typical(obs, "Median delay"), worst(obs, "Latest")],
      }
    ),
    metric(range, pings, {
      key: "pings",
      label: "X6 cadence",
      rule: `While in transit, a position update at least every ${formatSpan(RULES.pingMinutes * MINUTE)}, from departure to arrival. Measured for partners the carrier sends pings (X6) to.`,
      facts: (obs) => [typical(obs, "Median gap"), worst(obs, "Longest gap")],
    }),
  ]
}

/**
 * Each answer to a tender version, against its deadline. A version still
 * open past its deadline counts as missed; a cancel needs no answer.
 */
function responseObservations(
  scope: ReturnType<typeof tenderScope>,
  now: number
): Observation[] {
  const rows = db
    .select({
      version: schema.tenderVersions,
      response: schema.tenderResponses,
      tender: schema.tenders,
    })
    .from(schema.tenderVersions)
    .innerJoin(
      schema.tenders,
      eq(schema.tenders.id, schema.tenderVersions.tenderId)
    )
    .leftJoin(
      schema.tenderResponses,
      and(
        eq(schema.tenderResponses.tenderId, schema.tenderVersions.tenderId),
        eq(schema.tenderResponses.version, schema.tenderVersions.version)
      )
    )
    .where(scope)
    .all()

  const out: Observation[] = []
  for (const { version: v, response: r, tender: t } of rows) {
    if (v.purpose === "01") continue
    const received = Date.parse(v.receivedAt)
    const deadline = v.respondBy
      ? Date.parse(v.respondBy)
      : received + RULES.responseMinutes * MINUTE
    if (r) {
      const at = Date.parse(r.createdAt)
      out.push({
        partner: t.partner,
        at,
        ok: at <= deadline,
        minutes: (at - received) / MINUTE,
      })
    } else if (
      t.version === v.version &&
      t.status === "open" &&
      deadline < now
    ) {
      out.push({ partner: t.partner, at: deadline, ok: false, minutes: null })
    }
  }
  return out
}

/** Pickup and delivery 214s, by how long after the event each was sent. */
function milestoneObservations(
  scope: ReturnType<typeof tenderScope>,
  since: number | null
): (Observation & { code: string })[] {
  const rows = db
    .select({ event: schema.statusEvents, partner: schema.tenders.partner })
    .from(schema.statusEvents)
    .innerJoin(schema.loads, eq(schema.loads.id, schema.statusEvents.loadId))
    .innerJoin(schema.tenders, eq(schema.tenders.id, schema.loads.tenderId))
    .where(
      and(
        scope,
        eq(schema.statusEvents.type, "status"),
        inArray(schema.statusEvents.code, [...PICKUP, ...DELIVERY]),
        since === null
          ? undefined
          : gte(schema.statusEvents.createdAt, new Date(since).toISOString())
      )
    )
    .all()

  return rows.flatMap(({ event: e, partner }) => {
    const happened = eventTime(e)
    if (happened === null) return []
    const at = Date.parse(e.createdAt)
    const minutes = (at - happened) / MINUTE
    return [
      {
        partner,
        code: e.code,
        at,
        ok: minutes <= RULES.milestoneMinutes,
        minutes,
      },
    ]
  })
}

/**
 * Gaps between position updates from departure (AF) to arrival (X1), by
 * event time. A load still in transit adds the gap since its last update
 * once that gap is already over the limit.
 */
function pingObservations(
  scope: ReturnType<typeof tenderScope>,
  now: number
): Observation[] {
  const rows = db
    .select({
      event: schema.statusEvents,
      load: schema.loads,
      partner: schema.tenders.partner,
    })
    .from(schema.statusEvents)
    .innerJoin(schema.loads, eq(schema.loads.id, schema.statusEvents.loadId))
    .innerJoin(schema.tenders, eq(schema.tenders.id, schema.loads.tenderId))
    .where(and(scope, inArray(schema.statusEvents.code, ["AF", "X6", "X1"])))
    .all()
  // A partner that never gets an X6 is not asking for pings.
  const pinged = new Set(
    rows.filter((r) => r.event.code === "X6").map((r) => r.partner)
  )

  const byLoad = new Map<number, typeof rows>()
  for (const row of rows) {
    byLoad.set(row.load.id, [...(byLoad.get(row.load.id) ?? []), row])
  }

  const out: Observation[] = []
  for (const events of byLoad.values()) {
    if (!pinged.has(events[0].partner)) continue
    const timed = events
      .map((r) => ({ code: r.event.code, at: eventTime(r.event) }))
      .filter((e): e is { code: string; at: number } => e.at !== null)
      .sort((a, b) => a.at - b.at)
    const start = timed.findIndex((e) => e.code === "AF")
    if (start < 0) continue
    const end = timed.findIndex((e, i) => i > start && e.code === "X1")
    const leg = timed.slice(start, end < 0 ? undefined : end + 1)
    const partner = events[0].partner
    for (let i = 1; i < leg.length; i++) {
      const minutes = (leg[i].at - leg[i - 1].at) / MINUTE
      out.push({
        partner,
        at: leg[i].at,
        ok: minutes <= RULES.pingMinutes,
        minutes,
      })
    }
    const last = leg.at(-1)!
    const moving = events[0].load.status === "in_transit"
    if (end < 0 && moving && now - last.at > RULES.pingMinutes * MINUTE) {
      out.push({
        partner,
        at: now,
        ok: false,
        minutes: (now - last.at) / MINUTE,
      })
    }
  }
  return out
}

/**
 * When a 214's event happened, from its AT7 date, time and time code. No
 * time code means local time at the event's place.
 */
function eventTime(e: {
  date: string
  time: string
  timeCode: string | null
  location: string
}): number | null {
  const state = (JSON.parse(e.location) as { state?: string }).state
  const zone = zoneOfTimeCode(e.timeCode ?? "LT", state)
  return zone ? wallClockToMs(`${e.date}T${e.time}`, zone) : null
}

function metric(
  range: { since: number | null; now: number },
  obs: Observation[],
  spec: Pick<ComplianceMetric, "key" | "label" | "rule"> & {
    facts: (obs: Observation[]) => ComplianceMetric["facts"]
  }
): ComplianceMetric {
  const onTime = obs.filter((o) => o.ok).length
  const rate = obs.length ? onTime / obs.length : null

  const partners = new Map<string, { onTime: number; total: number }>()
  for (const o of obs) {
    const p = partners.get(o.partner) ?? { onTime: 0, total: 0 }
    p.total++
    if (o.ok) p.onTime++
    partners.set(o.partner, p)
  }

  return {
    key: spec.key,
    label: spec.label,
    rule: spec.rule,
    onTime,
    total: obs.length,
    rate,
    status: statusOf(rate),
    goal: RULES.goal,
    facts: obs.length ? spec.facts(obs) : [],
    byPartner: [...partners]
      .map(([partner, p]) => ({
        name: titleCase(partner),
        ...p,
        status: statusOf(p.onTime / p.total),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    daily: daily(range, obs),
  }
}

function statusOf(rate: number | null): ComplianceStatus {
  if (rate === null) return "none"
  if (rate >= RULES.goal) return "good"
  return rate >= RULES.warning ? "warning" : "critical"
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: site.timeZone })
const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** Every day from the period's start (or the first observation) to now. */
function daily(
  range: { since: number | null; now: number },
  obs: Observation[]
): ComplianceMetric["daily"] {
  const first = range.since ?? Math.min(...obs.map((o) => o.at))
  if (!Number.isFinite(first)) return []
  const counts = new Map<string, { onTime: number; total: number }>()
  for (const o of obs) {
    const key = dayKey.format(o.at)
    const c = counts.get(key) ?? { onTime: 0, total: 0 }
    c.total++
    if (o.ok) c.onTime++
    counts.set(key, c)
  }
  // Step whole calendar days on the keys themselves, so DST never skips one.
  const days: ComplianceMetric["daily"] = []
  const last = dayKey.format(range.now)
  for (
    let d = new Date(`${dayKey.format(first)}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= last;
    d = new Date(d.getTime() + 24 * 60 * MINUTE)
  ) {
    const day = d.toISOString().slice(0, 10)
    days.push({
      day,
      label: dayLabel.format(d),
      ...(counts.get(day) ?? { onTime: 0, total: 0 }),
    })
  }
  return days
}

function typical(obs: Observation[], label: string) {
  const values = measured(obs)
  return { label, value: span(values[Math.floor((values.length - 1) / 2)]) }
}

function worst(obs: Observation[], label: string) {
  return { label, value: span(measured(obs).at(-1)) }
}

function measured(obs: Observation[]): number[] {
  return obs
    .map((o) => o.minutes)
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b)
}

function span(minutes: number | undefined): string {
  if (minutes === undefined) return "-"
  if (minutes < 1) return "under 1 min"
  return formatSpan(minutes * MINUTE)
}
