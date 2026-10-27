/**
 * The Analytics filters, carried in the URL so a view can be bookmarked or
 * shared. Shippers are listed by what is hidden, not what is shown, so a
 * shipper that starts tendering appears without anyone opting in.
 */

export const PERIODS = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "all", label: "All time", days: null },
] as const

export type Period = (typeof PERIODS)[number]

export type AnalyticsFilters = {
  period: Period
  /** Shipper keys (see shipperKey) left out of every panel. */
  hiddenShippers: string[]
}

type SearchParams = Record<string, string | string[] | undefined>

const list = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

export function parseFilters(params: SearchParams): AnalyticsFilters {
  const requested = list(params.period)[0]
  return {
    period: PERIODS.find((p) => p.value === requested) ?? PERIODS[1],
    hiddenShippers: [...new Set(list(params.hide))].sort(),
  }
}

export function filtersHref(filters: AnalyticsFilters): string {
  const params = new URLSearchParams({ period: filters.period.value })
  for (const key of filters.hiddenShippers) params.append("hide", key)
  return `/?${params}`
}

/**
 * A shipper is its bill-to code within a partner: two partners may tender
 * for the same shipper under different codes, and codes are only unique
 * within the partner that assigned them. Tenders with no bill-to share "".
 */
export function shipperKey(partner: string, code: string | null): string {
  return `${partner}:${code ?? ""}`
}

export function toggleShipper(
  filters: AnalyticsFilters,
  key: string
): AnalyticsFilters {
  const hidden = filters.hiddenShippers.includes(key)
    ? filters.hiddenShippers.filter((k) => k !== key)
    : [...filters.hiddenShippers, key].sort()
  return { ...filters, hiddenShippers: hidden }
}
