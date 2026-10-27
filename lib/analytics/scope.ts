import "server-only"

import { and, count, gte, notInArray, sql, type SQL } from "drizzle-orm"

import { titleCase } from "@/components/loads"
import { db, schema } from "@/db"

import { shipperKey, type AnalyticsFilters } from "./filters"

/** The tenders the Analytics filters select, as a WHERE condition. */

const t = schema.tenders

// Must build the same string as shipperKey().
const SHIPPER_KEY = sql<string>`${t.partner} || ':' || coalesce(${t.shipperCode}, '')`

export function tenderScope(
  filters: AnalyticsFilters,
  now: number,
  options: { period?: boolean } = {}
): SQL | undefined {
  const days = options.period === false ? null : filters.period.days
  return and(
    days
      ? gte(t.createdAt, new Date(now - days * 86_400_000).toISOString())
      : undefined,
    filters.hiddenShippers.length
      ? notInArray(SHIPPER_KEY, filters.hiddenShippers)
      : undefined
  )
}

export type ShipperOption = {
  key: string
  name: string
  partner: string
  /** Tenders in the selected period, hidden or not. */
  tenders: number
}

/**
 * Every shipper that has ever tendered, so one with nothing in the period
 * can still be toggled, with its count for the period.
 */
export function getShippers(
  filters: AnalyticsFilters,
  now: number
): ShipperOption[] {
  const since = filters.period.days
    ? new Date(now - filters.period.days * 86_400_000).toISOString()
    : null
  const rows = db
    .select({
      partner: t.partner,
      code: t.shipperCode,
      name: sql<string | null>`max(${t.shipperName})`,
      tenders: since
        ? sql<number>`sum(case when ${t.createdAt} >= ${since} then 1 else 0 end)`
        : count(),
    })
    .from(t)
    .groupBy(t.partner, t.shipperCode)
    .all()
  return rows
    .map((r) => ({
      key: shipperKey(r.partner, r.code),
      name: r.name
        ? titleCase(r.name)
        : `Unknown shipper (${titleCase(r.partner)})`,
      partner: titleCase(r.partner),
      tenders: Number(r.tenders),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
