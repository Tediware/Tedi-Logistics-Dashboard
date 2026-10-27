import { apiRequest, TediwareError } from "./client"
import type { FeedEntry, ResultArtifact } from "./feed"
import { bySuffix, isRecord } from "./x12-json"

/**
 * Downloading the X12-shaped JSON for a feed entry.
 *
 * `GET /platform/artifacts/:id` returns an artifact's raw bytes. Which
 * artifact holds the X12-shaped JSON depends on the direction:
 *
 * - Inbound, passed straight through: the JSON output artifact.
 * - Outbound: two JSON input artifacts, the JSON as submitted and the same
 *   document after the outbound mapping, in the X12 shape the EDI is
 *   written from. The second is the one to read, because it is the same
 *   for every customer and partner on an implementation.
 *
 * Candidates are tried in that order and the first X12-shaped one wins, so
 * a document in some other shape (a 204 flow with an inbound mapping) is
 * reported as such rather than misread.
 */

// Ids come from the feed, so they are external input. Constrain them before
// they reach a URL.
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Refusing artifact id with unexpected characters: ${id}`)
  }
  return id
}

/** Downloads an artifact's raw file content as text. */
export async function fetchArtifactText(artifactId: string): Promise<string> {
  const id = safeId(artifactId)
  const response = await apiRequest(`/platform/artifacts/${id}`, {
    method: "GET",
  })
  const text = await response.text()
  if (!response.ok) {
    throw new TediwareError(
      `GET /platform/artifacts/${id} returned ${response.status}`,
      response.status,
      text
    )
  }
  return text
}

/** The JSON artifacts that may hold the X12-shaped document, best first. */
export function candidateArtifacts(entry: FeedEntry): ResultArtifact[] {
  const json = (entry.detail?.artifacts ?? []).filter(
    (a) => a.contentType === "application/json"
  )
  return entry.direction === "inbound"
    ? json.filter((a) => a.usage === "output")
    : json.filter((a) => a.usage === "input").reverse()
}

/** True for JSON in the implementation's X12 shape. */
export function isX12Shaped(document: unknown): boolean {
  return isRecord(document) && isRecord(bySuffix(document, "heading"))
}

/**
 * The entry's X12-shaped JSON, or null when none of its artifacts is in
 * that shape.
 */
export async function fetchX12Document(
  entry: FeedEntry
): Promise<unknown | null> {
  for (const artifact of candidateArtifacts(entry)) {
    const text = await fetchArtifactText(artifact.id)
    let document: unknown
    try {
      document = JSON.parse(text)
    } catch {
      continue
    }
    if (isX12Shaped(document)) return document
  }
  return null
}
