/**
 * Tediware configuration, read from the environment.
 *
 * The app runs with nothing configured: the screens work on whatever is
 * already in the database, and syncing waits until a key is set. The getter
 * fails loudly and names exactly what is missing when syncing needs it.
 */

export type ApiConfig = { baseUrl: string; apiKey: string }

const DEFAULT_BASE_URL = "https://tediware.com"
const DEFAULT_SYNC_INTERVAL_SECONDS = 60
const DEFAULT_SYNC_DAYS = 45

function read(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== "" ? value.trim() : undefined
}

/** True when an API key is set. */
export function isApiConfigured(): boolean {
  return !!read("TEDIWARE_API_KEY")
}

/** Base URL and API key for the platform API. Throws if the key is unset. */
export function getApiConfig(): ApiConfig {
  const apiKey = read("TEDIWARE_API_KEY")
  if (!apiKey) {
    throw new Error(
      "Tediware is not configured: missing TEDIWARE_API_KEY. " +
        "Set it in .env.local (see .env.example)."
    )
  }
  const baseUrl = read("TEDIWARE_BASE_URL") ?? DEFAULT_BASE_URL
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

/** Seconds between background syncs; 0 turns background syncing off. */
export function syncIntervalSeconds(): number {
  return positive(read("SYNC_INTERVAL_SECONDS"), DEFAULT_SYNC_INTERVAL_SECONDS)
}

/** How far back the first sync reads. Tediware keeps results 45 days. */
export function syncDays(): number {
  return positive(read("SYNC_DAYS"), DEFAULT_SYNC_DAYS) || DEFAULT_SYNC_DAYS
}

function positive(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

/** A human-readable summary of what is configured, for the startup log. */
export function describeConfig(): { live: boolean; lines: string[] } {
  const live = isApiConfigured()
  const interval = syncIntervalSeconds()
  const lines = [
    `platform API: ${live ? `live (${read("TEDIWARE_BASE_URL") ?? DEFAULT_BASE_URL})` : "not configured (set TEDIWARE_API_KEY)"}`,
    `background sync: ${!live ? "waiting for an API key" : interval ? `every ${interval}s` : "off (SYNC_INTERVAL_SECONDS=0)"}`,
  ]
  return { live, lines }
}
