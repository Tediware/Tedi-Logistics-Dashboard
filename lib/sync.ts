import "server-only"

import { asc, eq, isNotNull } from "drizzle-orm"

import { db, schema } from "@/db"
import type { SyncedDocument, SyncState } from "@/db/schema"
import {
  clearDomainTables,
  recordResponse,
  recordStatus,
  recordTender,
  type DocumentInput,
  type Recorded,
} from "@/lib/loads/store"
import {
  fetchX12Document,
  isApiConfigured,
  listFeedEntries,
  syncDays,
  syncIntervalSeconds,
  TediwareError,
  transactionSetOf,
  usageIndicatorOf,
  type FeedEntry,
} from "@/lib/tediware"

/**
 * Reading the Tediware feed into this app.
 *
 * Each run pages through the feed from the saved cursor (or, the first
 * time, from SYNC_DAYS ago), records every entry in synced_documents, and
 * for the documents this app understands downloads the X12-shaped JSON and
 * builds tenders, answers and loads from it. The cursor is saved after each
 * page, so a run that stops part way resumes there.
 *
 * Only reads: nothing here sends, resends or changes anything in Tediware.
 */

type Handler = (input: DocumentInput) => Recorded

// What this app reads: tenders in, and the carrier's answers and status
// updates out.
const HANDLERS: Record<string, Handler> = {
  "inbound:204": recordTender,
  "outbound:990": recordResponse,
  "outbound:214": recordStatus,
}

const STATE_ID = 1

/** What became of a document this run looked at. */
type Done = Exclude<SyncedDocument["status"], "pending">

export type SyncResult = {
  entries: number
  processed: number
  skipped: number
  failed: number
  error: string | null
}

const globalForSync = globalThis as unknown as {
  syncRun?: Promise<SyncResult> | null
  syncTimer?: ReturnType<typeof setInterval>
}

export function getSyncState(): SyncState | null {
  return (
    db
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.id, STATE_ID))
      .get() ?? null
  )
}

export function isSyncRunning(): boolean {
  return !!globalForSync.syncRun
}

/**
 * Reads the feed up to now. A run already in progress is joined rather
 * than started twice, so the background timer and the Sync now button can
 * never read the same page at once.
 */
export function runSync(): Promise<SyncResult> {
  globalForSync.syncRun ??= drain().finally(() => {
    globalForSync.syncRun = null
  })
  return globalForSync.syncRun
}

/** Starts syncing every SYNC_INTERVAL_SECONDS, once per server process. */
export function startBackgroundSync(): void {
  const seconds = syncIntervalSeconds()
  if (!seconds || !isApiConfigured() || globalForSync.syncTimer) return
  const tick = () => {
    runSync().then(
      (r) => {
        if (r.error) console.error(`[sync] ${r.error}`)
      },
      (e: unknown) => console.error("[sync]", e)
    )
  }
  globalForSync.syncTimer = setInterval(tick, seconds * 1000)
  tick()
}

async function drain(): Promise<SyncResult> {
  const result: SyncResult = {
    entries: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
    error: null,
  }
  let state = ensureState()
  updateState({ lastRunAt: new Date().toISOString() })

  try {
    for (;;) {
      const page = await listFeedEntries(
        state.cursor ? { cursor: state.cursor } : { since: state.since }
      )
      for (const entry of page.feedEntries) {
        const status = await ingest(entry)
        result.entries++
        if (status) result[status]++
      }
      // An empty page has no cursor; keep the last one.
      if (page.pagination.nextCursor) {
        state = updateState({ cursor: page.pagination.nextCursor })
      }
      if (page.feedEntries.length) {
        console.log(
          `[sync] ${page.feedEntries.length} entries, up to ${page.feedEntries.at(-1)!.createdAt}`
        )
      }
      if (!page.pagination.hasMore) break
    }
    updateState({ lastSuccessAt: new Date().toISOString(), lastError: null })
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
    updateState({ lastError: result.error })
  }
  return result
}

/**
 * Records one feed entry and, when this app reads it, downloads and
 * processes its document. Returns what happened, or null for an entry an
 * earlier run already finished. Throws only when the API cannot be reached,
 * which ends the run before the page's cursor is saved.
 */
async function ingest(entry: FeedEntry): Promise<Done | null> {
  const row = recordEntry(entry)
  if (row.status !== "pending") return null

  const skip = reasonToSkip(row)
  if (skip) return finish(row.id, { status: "skipped", note: skip })

  let document: unknown
  try {
    document = await fetchX12Document(entry)
  } catch (e) {
    // A refusal (a missing artifact, say) fails this entry only. A rate
    // limit, a server error or no answer at all is worth retrying, so stop
    // and let the next run start again from this page.
    const status = e instanceof TediwareError ? (e.status ?? 0) : 0
    if (status >= 400 && status < 500 && status !== 429) {
      return finish(row.id, { status: "failed", note: (e as Error).message })
    }
    throw e
  }
  if (document === null) {
    return finish(row.id, {
      status: "skipped",
      note:
        row.direction === "inbound"
          ? "None of its artifacts is X12-shaped JSON. This app reads 204s from flows that pass the X12 straight through, with no inbound mapping."
          : "None of its artifacts is X12-shaped JSON.",
    })
  }
  db.update(schema.syncedDocuments)
    .set({ rawDocument: JSON.stringify(document) })
    .where(eq(schema.syncedDocuments.id, row.id))
    .run()
  return processDocument({ ...row, rawDocument: JSON.stringify(document) })
}

function recordEntry(entry: FeedEntry): SyncedDocument {
  db.insert(schema.syncedDocuments)
    .values({
      entryExtid: entry.id,
      resultExtid: entry.resultId,
      traceGuid: entry.traceGuid,
      direction: entry.direction,
      outcome: entry.status,
      errorMessage: entry.errorMessage ?? entry.detail?.errorMessage ?? null,
      partner: (entry.partnerKey ?? entry.detail?.partner?.key)?.toUpperCase(),
      transactionSet: transactionSetOf(entry),
      usageIndicator: usageIndicatorOf(entry),
      resend: entry.detail?.resend === true,
      rawEntry: JSON.stringify(entry),
      // Tediware gives microseconds; one precision keeps string order right.
      createdAt: new Date(entry.createdAt).toISOString(),
    })
    .onConflictDoNothing()
    .run()
  return db
    .select()
    .from(schema.syncedDocuments)
    .where(eq(schema.syncedDocuments.entryExtid, entry.id))
    .get()!
}

function reasonToSkip(row: SyncedDocument): string | null {
  if (row.outcome === "error") {
    return "Tediware reported an error for this document, so it never reached the partner."
  }
  if (!HANDLERS[`${row.direction}:${row.transactionSet}`]) {
    return "This app reads inbound 204s and outbound 990s and 214s."
  }
  if (!row.partner) return "The entry names no partner."
  if (row.usageIndicator === "T") return "A test interchange (ISA15 = T)."
  if (row.resend) return "A resend of a document already sent."
  return null
}

/** Runs a downloaded document through its handler and records the outcome. */
function processDocument(row: SyncedDocument): Done {
  const handler = HANDLERS[`${row.direction}:${row.transactionSet}`]
  if (!handler || !row.partner || !row.rawDocument) {
    return finish(row.id, { status: "skipped", note: "Nothing to process." })
  }
  try {
    const recorded = handler({
      documentId: row.id,
      partner: row.partner,
      at: row.createdAt,
      document: JSON.parse(row.rawDocument),
    })
    return finish(row.id, {
      status: recorded.status,
      reference: recorded.reference,
      note: recorded.note ?? null,
    })
  } catch (e) {
    return finish(row.id, {
      status: "failed",
      note: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * Empties the domain tables and builds them again from every downloaded
 * document, in the order Tediware processed them. Nothing is read from
 * Tediware. Run it after changing how documents are read.
 */
export function rebuild(): {
  processed: number
  skipped: number
  failed: number
} {
  const counts = { processed: 0, skipped: 0, failed: 0 }
  clearDomainTables()
  const rows = db
    .select()
    .from(schema.syncedDocuments)
    .where(isNotNull(schema.syncedDocuments.rawDocument))
    .orderBy(
      asc(schema.syncedDocuments.createdAt),
      asc(schema.syncedDocuments.id)
    )
    .all()
  for (const row of rows) {
    const skip = reasonToSkip(row)
    const status = skip
      ? finish(row.id, { status: "skipped", note: skip })
      : processDocument(row)
    counts[status]++
  }
  return counts
}

function finish(
  id: number,
  outcome: { status: Done; note: string | null; reference?: string }
): Done {
  db.update(schema.syncedDocuments)
    .set({
      status: outcome.status,
      note: outcome.note,
      ...(outcome.reference !== undefined && { reference: outcome.reference }),
      processedAt: new Date().toISOString(),
    })
    .where(eq(schema.syncedDocuments.id, id))
    .run()
  return outcome.status
}

function ensureState(): SyncState {
  const since = new Date(Date.now() - syncDays() * 86_400_000).toISOString()
  db.insert(schema.syncState)
    .values({ id: STATE_ID, since })
    .onConflictDoNothing()
    .run()
  return getSyncState()!
}

function updateState(
  values: Partial<Omit<SyncState, "id" | "updatedAt">>
): SyncState {
  db.update(schema.syncState)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(eq(schema.syncState.id, STATE_ID))
    .run()
  return getSyncState()!
}
