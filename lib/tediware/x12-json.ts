/**
 * Helpers for reading X12-shaped JSON: an inbound document passed straight
 * through, and the mapped JSON of an outbound document just before Tediware
 * writes its EDI.
 *
 * The shape follows the implementation (a spec): `heading` / `detail` /
 * `summary` sections, segment keys like
 * `beginning_segment_for_purchase_order_BEG`, element keys by position like
 * `purchase_order_number_03`, loops like `name_N1_loop`, and code values
 * that are bare ("SA") after a mapping but labelled
 * ("purchase_order_number_PO") when the X12 is passed straight through.
 * Read codes with `code()`, which accepts both. That shape is stable per
 * implementation, across partners and releases. Translating it into your
 * own vocabulary is your code's job; these helpers make that translation
 * read like the implementation guide.
 *
 * Look things up by their stable suffix (segment tag, element position) and
 * select repeated segments by qualifier code, never by a partner-specific
 * value, so a second partner on the same implementation needs no new code.
 */

export type X12Record = Record<string, unknown>

export function isRecord(value: unknown): value is X12Record {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** A segment or loop that occurs once arrives as an object, repeated ones as an array. */
export function asArray(value: unknown): X12Record[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  return isRecord(value) ? [value] : []
}

/**
 * The value under the first key ending in `suffix`. Key names carry a
 * human-readable prefix that can differ between implementations, so match on
 * the stable tail: `_BEG`, `_N1_loop`, `_03`.
 */
export function bySuffix(
  record: X12Record | undefined,
  suffix: string
): unknown {
  if (!record) return undefined
  const key = Object.keys(record).find((k) => k.endsWith(suffix))
  return key === undefined ? undefined : record[key]
}

/** Every occurrence of a segment (by tag, e.g. "DTM") in a section or loop entry. */
export function segments(
  container: X12Record | undefined,
  tag: string
): X12Record[] {
  return asArray(bySuffix(container, `_${tag}`))
}

/** The first occurrence of a segment, by tag. */
export function segment(
  container: X12Record | undefined,
  tag: string
): X12Record | undefined {
  return segments(container, tag)[0]
}

/** Every entry of a loop, by its leading segment's tag (e.g. "N1" for `name_N1_loop`). */
export function loop(
  container: X12Record | undefined,
  tag: string
): X12Record[] {
  return asArray(bySuffix(container, `_${tag}_loop`))
}

/** An element by two-digit position, e.g. element(beg, "03"). */
export function element(seg: X12Record | undefined, position: string): unknown {
  return bySuffix(seg, `_${position}`)
}

/**
 * The first segment whose qualifier element (default position "01") equals
 * one of `codes`, preferring codes in the order given. For example the
 * requested ship date: withQualifier(segments(heading, "DTM"), ["010", "118"]).
 */
export function withQualifier(
  segs: X12Record[],
  codes: string[],
  position = "01"
): X12Record | undefined {
  for (const wanted of codes) {
    const hit = segs.find((s) => code(element(s, position)) === wanted)
    if (hit) return hit
  }
  return undefined
}

/**
 * Qualifier/value pairs spread across consecutive element positions, as on
 * PO1 (06/07, 08/09, ... 24/25) and LIN. Pairs with a missing value are
 * dropped: some mappings emit a qualifier with no id beside it.
 */
export function qualifiedIds(
  seg: X12Record | undefined,
  firstQualifierPosition: number,
  lastQualifierPosition: number
): Map<string, string> {
  const ids = new Map<string, string>()
  for (
    let position = firstQualifierPosition;
    position <= lastQualifierPosition;
    position += 2
  ) {
    const qualifier = code(element(seg, String(position).padStart(2, "0")))
    const id = str(element(seg, String(position + 1).padStart(2, "0")))
    if (qualifier && id && !ids.has(qualifier)) ids.set(qualifier, id)
  }
  return ids
}

/**
 * An X12 code value, bare or labelled: "CR" and "customer_reference_number_CR"
 * both read as "CR". X12 codes never contain an underscore, so the code is
 * whatever follows the last one.
 */
export function code(value: unknown): string | undefined {
  const text = str(value)
  return text?.slice(text.lastIndexOf("_") + 1) || undefined
}

/** A trimmed non-empty string, or undefined. Numbers are stringified. */
export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim()
  if (typeof value === "number") return String(value)
  return undefined
}

/** A finite number from a number or numeric string, or undefined. */
export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * X12 CCYYMMDD to an ISO calendar date ("2026-07-02"). Undefined for anything
 * else, including impossible dates such as month 13.
 */
export function x12Date(value: unknown): string | undefined {
  const text = str(value)
  if (!text || !/^\d{8}$/.test(text)) return undefined
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    return undefined
  }
  return iso
}

/**
 * X12 HHMM[SS[DD]] to "HH:MM". Undefined for anything else, including
 * impossible times such as 2575.
 */
export function x12Time(value: unknown): string | undefined {
  const text = str(value)
  if (!text || !/^\d{4}(\d{2}){0,2}$/.test(text)) return undefined
  const hours = Number(text.slice(0, 2))
  const minutes = Number(text.slice(2, 4))
  if (hours > 23 || minutes > 59) return undefined
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`
}
