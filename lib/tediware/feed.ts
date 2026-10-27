import { apiGetJson } from "./client"

/**
 * The feed: an append-only stream of every document Tediware processed for
 * the organization, inbound and outbound, whatever delivery method each
 * partner uses. Entries carry identifiers and result metadata, never the
 * document itself; that is downloaded from an artifact (see artifacts.ts).
 *
 * Page with `nextCursor`. An empty page returns a null cursor, so the reader
 * keeps the last one it saved. The freshest couple of seconds are withheld,
 * so polling faster than that gains nothing.
 */

export type ResultArtifact = {
  id: string
  usage: "input" | "output"
  /** MIME type, e.g. "application/json" or "application/edi-x12". */
  contentType?: string
  filename?: string
}

export type FeedEntry = {
  id: string
  direction: "inbound" | "outbound"
  status: "success" | "error"
  createdAt: string
  partnerKey: string | null
  traceGuid: string | null
  resultId: string | null
  errorMessage?: string | null
  detail?: {
    partner?: { key?: string }
    /** ISA15: "T" test or "P" production. */
    usageIndicator?: "P" | "T"
    /** True when this entry is a resend of a document already sent. */
    resend?: boolean
    x12?: {
      transaction?: {
        transactionSetIdentifier?: string
        controlNumber?: string | number
      }
      interchange?: {
        controlNumber?: string | number
        usageIndicatorCode?: string
      }
    }
    artifacts?: ResultArtifact[]
    errorMessage?: string
  }
}

export type FeedPage = {
  feedEntries: FeedEntry[]
  pagination: { hasMore: boolean; nextCursor: string | null }
}

export const FEED_PAGE_SIZE = 100

/** One page of the feed, after a cursor or from a point in time. */
export async function listFeedEntries(
  from: { cursor: string } | { since: string }
): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) })
  if ("cursor" in from) params.set("cursor", from.cursor)
  else params.set("since", from.since)
  return apiGetJson<FeedPage>(`/platform/feed_entries?${params}`)
}

// Functional identifier codes (GS01) for the sets a carrier exchanges, so
// an entry identified by its functional group reads the same as one
// identified by its transaction set.
const SET_OF_GROUP: Record<string, string> = {
  SM: "204",
  GF: "990",
  QM: "214",
  IM: "210",
  FA: "997",
}

/**
 * The transaction set an entry's envelope names, when it names one. The
 * identifier may be the transaction set (ST01, "214") or the functional
 * group (GS01, "QM"); both come back as the transaction set.
 */
export function transactionSetOf(entry: FeedEntry): string | null {
  const code = entry.detail?.x12?.transaction?.transactionSetIdentifier?.trim()
  if (!code) return null
  return SET_OF_GROUP[code] ?? code
}

/** ISA15: "T" for a test interchange, "P" for production. */
export function usageIndicatorOf(entry: FeedEntry): "P" | "T" | null {
  const usage =
    entry.detail?.usageIndicator ??
    entry.detail?.x12?.interchange?.usageIndicatorCode
  return usage === "P" || usage === "T" ? usage : null
}
