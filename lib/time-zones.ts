/**
 * Stop times on a 204 are the stop's local wall-clock with no zone. To count
 * down to one ("pickup in 2d 3h") it needs a zone, and a state or province
 * is enough at this scale: where a state spans two zones, its most populous
 * one wins.
 */

const ZONES: Record<string, string> = {
  // US
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  // Canada
  AB: "America/Edmonton",
  BC: "America/Vancouver",
  MB: "America/Winnipeg",
  NB: "America/Moncton",
  NL: "America/St_Johns",
  NS: "America/Halifax",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
  ON: "America/Toronto",
  PE: "America/Halifax",
  QC: "America/Toronto",
  SK: "America/Regina",
  YT: "America/Whitehorse",
}

export function zoneOfState(state: string | null | undefined): string | null {
  return (state && ZONES[state.toUpperCase()]) || null
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(ms)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute")
  )
  return Math.round((asUtc - Math.floor(ms / 60_000) * 60_000) / 60_000)
}

/** "2026-11-05T09:00" in a zone, as epoch milliseconds. Null if unparseable. */
export function wallClockToMs(local: string, timeZone: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return null
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // Guess with the offset at the naive instant, then correct once for a
  // DST change between the guess and the answer.
  const guess = asUtc - offsetMinutes(asUtc, timeZone) * 60_000
  return asUtc - offsetMinutes(guess, timeZone) * 60_000
}

/** A stop's local time as an instant, when its state names a zone. */
export function stopTimeToMs(
  local: string | null | undefined,
  state: string | null | undefined
): number | null {
  const zone = zoneOfState(state)
  return local && zone ? wallClockToMs(local, zone) : null
}

// X12 time codes (G62-05, AT7-07). The plain ones follow daylight saving;
// the S/D pairs are fixed offsets (Etc/GMT signs are inverted).
const TIME_CODES: Record<string, string> = {
  AT: "America/Halifax",
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PT: "America/Los_Angeles",
  NT: "America/St_Johns",
  ES: "Etc/GMT+5",
  ED: "Etc/GMT+4",
  CS: "Etc/GMT+6",
  CD: "Etc/GMT+5",
  MS: "Etc/GMT+7",
  MD: "Etc/GMT+6",
  PS: "Etc/GMT+8",
  PD: "Etc/GMT+7",
  UT: "UTC",
  GM: "UTC",
}

/**
 * The zone an X12 time code names. LT (local time) means the zone of the
 * place the time is about, so it needs that place's state or province.
 */
export function zoneOfTimeCode(
  timeCode: string | null | undefined,
  state?: string | null
): string | null {
  const code = timeCode?.toUpperCase()
  if (!code) return null
  return code === "LT" ? zoneOfState(state) : (TIME_CODES[code] ?? null)
}
