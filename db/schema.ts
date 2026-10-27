import { sql } from "drizzle-orm"
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/**
 * SQLite schema (Drizzle).
 *
 * `synced_documents` is the integration's audit log: one row per Tediware
 * feed entry, with the entry and the downloaded document exactly as they
 * arrived. The domain tables after it are built from those rows and link
 * back to them rather than copying payloads, so they can be rebuilt at any
 * time (`npm run sync:rebuild`).
 *
 * Convention: columns holding a Tediware-side identifier use the `_extid`
 * suffix, never `_id`, so foreign ids stay visually distinct from local
 * autoincrement ids. Timestamps are ISO strings.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Every feed entry read from Tediware, inbound and outbound. Unique on the
 * entry id, so reading a page twice (a crash before the cursor was saved)
 * changes nothing.
 */
export const syncedDocuments = sqliteTable(
  "synced_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entryExtid: text("entry_extid").notNull(),
    resultExtid: text("result_extid"),
    traceGuid: text("trace_guid"),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    // What Tediware says happened: success, or an error in its flow.
    outcome: text("outcome", { enum: ["success", "error"] }).notNull(),
    errorMessage: text("error_message"),
    partner: text("partner"),
    transactionSet: text("transaction_set"),
    usageIndicator: text("usage_indicator", { enum: ["P", "T"] }),
    // A resend of a document already delivered once.
    resend: integer("resend", { mode: "boolean" }).notNull().default(false),
    // What the document is to a person, e.g. a shipment ID.
    reference: text("reference"),
    // What this app did with it: built domain rows, left it alone, or failed.
    status: text("status", {
      enum: ["pending", "processed", "skipped", "failed"],
    })
      .notNull()
      .default("pending"),
    // Why it was skipped, or what failed.
    note: text("note"),
    rawEntry: text("raw_entry").notNull(),
    // The X12-shaped JSON, when one was downloaded.
    rawDocument: text("raw_document"),
    // When Tediware processed it: the time every screen and metric uses.
    createdAt: text("created_at").notNull(),
    syncedAt: text("synced_at").notNull().default(now),
    processedAt: text("processed_at"),
  },
  (t) => [uniqueIndex("synced_documents_entry_extid_unq").on(t.entryExtid)]
)

/**
 * Where the feed reader is, one row (id 1). `cursor` is the feed's opaque
 * high-water mark; until the first page returns one, reading starts at
 * `since`.
 */
export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey(),
  cursor: text("cursor"),
  since: text("since").notNull(),
  lastRunAt: text("last_run_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  updatedAt: text("updated_at").notNull().default(now),
})

/*
 * Domain tables: the carrier's side of a load, from tender to delivery, as
 * its documents show it. Each row links to the synced document it came from.
 */

/**
 * One row per partner shipment ID, holding the current version. `tender` is
 * the tender block built from that version. The summary columns come from
 * the same version; times are the partner's local wall-clock
 * ("2026-11-05T09:00"), as the 204 gives them.
 */
export const tenders = sqliteTable(
  "tenders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    partner: text("partner").notNull(),
    // The partner's shipment ID (204 B2-04).
    tenderNumber: text("tender_number").notNull(),
    status: text("status", {
      enum: ["open", "accepted", "declined", "cancelled"],
    })
      .notNull()
      .default("open"),
    version: integer("version").notNull(),
    // B2A-01 of the current version: 00 original, 04 change, 01 cancel.
    purpose: text("purpose").notNull(),
    tender: text("tender").notNull(),
    // The 204's bill-to party: the shipper the partner tenders for.
    shipperName: text("shipper_name"),
    shipperCode: text("shipper_code"),
    originName: text("origin_name"),
    originCity: text("origin_city"),
    originState: text("origin_state"),
    destinationName: text("destination_name"),
    destinationCity: text("destination_city"),
    destinationState: text("destination_state"),
    pickupAt: text("pickup_at"),
    deliveryAt: text("delivery_at"),
    weight: real("weight"),
    weightUnitCode: text("weight_unit_code"),
    handlingUnits: integer("handling_units"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("tenders_partner_number_unq").on(t.partner, t.tenderNumber),
  ]
)

/** Every 204 received for a tender, in arrival order. */
export const tenderVersions = sqliteTable(
  "tender_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenderId: integer("tender_id")
      .notNull()
      .references(() => tenders.id),
    documentId: integer("document_id")
      .notNull()
      .references(() => syncedDocuments.id),
    version: integer("version").notNull(),
    purpose: text("purpose").notNull(),
    tender: text("tender").notNull(),
    // The partner's must-respond-by (G62*64), when the 204 set one.
    respondBy: text("respond_by"),
    receivedAt: text("received_at").notNull(),
  },
  (t) => [
    uniqueIndex("tender_versions_document_unq").on(t.documentId),
    uniqueIndex("tender_versions_tender_version_unq").on(t.tenderId, t.version),
  ]
)

/**
 * The carrier's answer (990) to one tender version: the version that was
 * current when the 990 went out. The first answer to a version counts.
 */
export const tenderResponses = sqliteTable(
  "tender_responses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tenderId: integer("tender_id")
      .notNull()
      .references(() => tenders.id),
    documentId: integer("document_id")
      .notNull()
      .references(() => syncedDocuments.id),
    version: integer("version").notNull(),
    code: text("code", { enum: ["A", "D"] }).notNull(),
    loadNumber: text("load_number"),
    declineReason: text("decline_reason"),
    // The decision date as the 990 gives it (B1-03).
    date: text("date"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("tender_responses_tender_version_unq").on(
      t.tenderId,
      t.version
    ),
  ]
)

/** An accepted tender, under the carrier's own load number. */
export const loads = sqliteTable(
  "loads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loadNumber: text("load_number").notNull(),
    tenderId: integer("tender_id")
      .notNull()
      .references(() => tenders.id),
    status: text("status", {
      enum: [
        "booked",
        "at_pickup",
        "in_transit",
        "at_delivery",
        "delivered",
        "cancelled",
      ],
    })
      .notNull()
      .default("booked"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("loads_tender_unq").on(t.tenderId)]
)

/**
 * Each shipment status or appointment (one AT7) on a 214 sent for a load.
 * `ordinal` numbers the AT7s within their document.
 */
export const statusEvents = sqliteTable(
  "status_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loadId: integer("load_id")
      .notNull()
      .references(() => loads.id),
    documentId: integer("document_id")
      .notNull()
      .references(() => syncedDocuments.id),
    ordinal: integer("ordinal").notNull(),
    type: text("type", { enum: ["status", "appointment"] }).notNull(),
    code: text("code").notNull(),
    reasonCode: text("reason_code"),
    // The event's local date and time as the 214 gives them: "2026-11-05",
    // "09:12", and its time code (null means local time).
    date: text("date").notNull(),
    time: text("time").notNull(),
    timeCode: text("time_code"),
    stopSequence: integer("stop_sequence"),
    // city, state, country and coordinates (decimal degrees), when known.
    location: text("location").notNull(),
    // When the 214 went out.
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("status_events_document_ordinal_unq").on(
      t.documentId,
      t.ordinal
    ),
  ]
)

export type SyncedDocument = typeof syncedDocuments.$inferSelect
export type SyncState = typeof syncState.$inferSelect
export type Tender = typeof tenders.$inferSelect
export type TenderVersion = typeof tenderVersions.$inferSelect
export type TenderResponse = typeof tenderResponses.$inferSelect
export type Load = typeof loads.$inferSelect
export type StatusEventRow = typeof statusEvents.$inferSelect
