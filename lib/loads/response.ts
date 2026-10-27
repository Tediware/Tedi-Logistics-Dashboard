import {
  bySuffix,
  code,
  element,
  isRecord,
  segment,
  segments,
  str,
  withQualifier,
  x12Date,
  type X12Record,
} from "@/lib/tediware/x12-json"

/**
 * Reading a 990 the carrier sent, in its X12 shape, into the answer it
 * gives: which tender, accepted or declined, and under what load number.
 */

export type ParsedResponse = {
  /** B1-02: the partner's shipment ID, the tender being answered. */
  shipmentId: string
  /** B1-04: A accepted, D declined. */
  code: "A" | "D"
  /** The carrier's load number (N9*CN), when the 990 gives one. */
  loadNumber: string | null
  /** B1-03 as an ISO date. */
  date: string | null
  declineReason: string | null
}

// N9 qualifiers that carry the carrier's own number for the load.
const LOAD_NUMBER_QUALIFIERS = ["CN"]

export function parse990(document: unknown): ParsedResponse {
  if (!isRecord(document)) throw new Error("The 990 is not a JSON object.")
  const heading = asRecord(bySuffix(document, "heading"))
  const b1 = segment(heading, "B1")

  const shipmentId = str(element(b1, "02"))
  if (!shipmentId) throw new Error("The 990 has no shipment ID (B1-02).")
  const action = code(element(b1, "04"))
  if (action !== "A" && action !== "D") {
    throw new Error(
      `990 for ${shipmentId}: unknown reservation action ${action ?? "(none)"} (B1-04).`
    )
  }

  const n9 = withQualifier(segments(heading, "N9"), LOAD_NUMBER_QUALIFIERS)
  return {
    shipmentId,
    code: action,
    loadNumber: str(element(n9, "02")) ?? null,
    date: x12Date(element(b1, "03")) ?? null,
    declineReason:
      action === "D"
        ? (str(element(segment(heading, "K1"), "01")) ??
          code(element(b1, "05")) ??
          null)
        : null,
  }
}

function asRecord(value: unknown): X12Record | undefined {
  return isRecord(value) ? value : undefined
}
