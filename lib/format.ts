import { site } from "@/lib/site"

/** Presentation helpers. Pure formatting, no data access. */

/** ISO timestamp -> "Jul 6, 2026, 2:30 PM" in UTC. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date)
}

/** Pretty-prints a value, or a string holding JSON; other strings pass through. */
export function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * An instant in the app's own zone (lib/site.ts): "Tue Nov 3, 14:07". Every
 * instant is shown in one zone so a day's documents read as one timeline.
 */
export function formatTime(
  value: string | number | Date | null | undefined
): string {
  if (value === null || value === undefined) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: site.timeZone,
  }).format(date)
}

/** A local wall-clock time as a document gave it, "2026-11-05T09:00". */
export function formatWallClock(local: string | null | undefined): string {
  if (!local) return "-"
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local)
  if (!m) return local
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
  return m[4] ? `${day}, ${m[4]}:${m[5]}` : day
}

/** A length of time, coarse: "45 min", "3h 10m", "2d 3h". */
export function formatSpan(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / MINUTE))} min`
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR)
    const m = Math.round((abs % HOUR) / MINUTE)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(abs / DAY)
  const h = Math.round((abs % DAY) / HOUR)
  return h ? `${d}d ${h}h` : `${d}d`
}

/** "in 2d 3h" or "3h 10m ago", against a given now. */
export function formatRelative(target: number, now: number): string {
  const diff = target - now
  return diff >= 0 ? `in ${formatSpan(diff)}` : `${formatSpan(diff)} ago`
}
