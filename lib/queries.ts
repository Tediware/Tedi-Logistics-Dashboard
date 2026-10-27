import "server-only"

import { count, desc, eq, max } from "drizzle-orm"

import { db, schema } from "@/db"
import type { SyncedDocument } from "@/db/schema"

/** Read side of the synced documents, for the Activity views. */

export const DOCUMENT_FILTERS = [
  { value: "all", label: "All" },
  { value: "processed", label: "Processed" },
  { value: "skipped", label: "Skipped" },
  { value: "failed", label: "Failed" },
] as const

export type DocumentFilter = (typeof DOCUMENT_FILTERS)[number]["value"]

export type Activity = {
  documents: SyncedDocument[]
  counts: Record<SyncedDocument["status"], number>
  total: number
  /** When Tediware processed the newest document synced so far. */
  latest: string | null
}

/** Synced documents, newest first, with counts by status. */
export function getActivity(
  filter: DocumentFilter = "all",
  limit = 200
): Activity {
  const d = schema.syncedDocuments
  const documents = db
    .select()
    .from(d)
    .where(filter === "all" ? undefined : eq(d.status, filter))
    .orderBy(desc(d.createdAt), desc(d.id))
    .limit(limit)
    .all()

  const counts = { pending: 0, processed: 0, skipped: 0, failed: 0 }
  for (const row of db
    .select({ status: d.status, n: count() })
    .from(d)
    .groupBy(d.status)
    .all()) {
    counts[row.status] = row.n
  }
  const latest =
    db
      .select({ at: max(d.createdAt) })
      .from(d)
      .get()?.at ?? null

  return {
    documents,
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    latest,
  }
}

export type DocumentDetail = {
  document: SyncedDocument
  /** The tender this document made or touched, when it did. */
  tenderId: number | null
}

export function getDocumentDetail(id: number): DocumentDetail | null {
  const document = db
    .select()
    .from(schema.syncedDocuments)
    .where(eq(schema.syncedDocuments.id, id))
    .get()
  if (!document) return null

  const tenderId =
    db
      .select({ id: schema.tenderVersions.tenderId })
      .from(schema.tenderVersions)
      .where(eq(schema.tenderVersions.documentId, id))
      .get()?.id ??
    db
      .select({ id: schema.tenderResponses.tenderId })
      .from(schema.tenderResponses)
      .where(eq(schema.tenderResponses.documentId, id))
      .get()?.id ??
    db
      .select({ id: schema.loads.tenderId })
      .from(schema.statusEvents)
      .innerJoin(schema.loads, eq(schema.loads.id, schema.statusEvents.loadId))
      .where(eq(schema.statusEvents.documentId, id))
      .get()?.id ??
    null

  return { document, tenderId }
}
