import "server-only"

import { and, desc, eq, lte } from "drizzle-orm"

import { db, schema } from "@/db"
import type { Load, Tender } from "@/db/schema"

import { placeEvent } from "./place"
import { parse990 } from "./response"
import { parse214 } from "./status"
import { parseTender204, type TenderStop } from "./tender"

/**
 * Turns synced documents into the carrier's tenders and loads. Each function
 * takes one document and is idempotent per document: running it again
 * updates the rows it made. Documents are fed in the order Tediware
 * processed them, so a 990 finds the 204 it answers.
 */

export type DocumentInput = {
  /** The synced_documents row, for domain rows to link to. */
  documentId: number
  partner: string
  /** When Tediware processed the document. */
  at: string
  document: unknown
}

export type Recorded = {
  status: "processed" | "skipped"
  reference: string
  note?: string
}

/**
 * Records a 204 as the next version of its tender. Only the newest version
 * becomes the tender's current state, so an old 204 processed again never
 * rolls a tender back.
 */
export function recordTender(input: DocumentInput): Recorded {
  const parsed = parseTender204(input.document)
  const tenderNumber = parsed.tender.id
  const blockText = JSON.stringify(parsed.tender)
  const at = input.at

  db.transaction((tx) => {
    tx.insert(schema.tenders)
      .values({
        partner: input.partner,
        tenderNumber,
        version: 0,
        purpose: parsed.purpose,
        tender: blockText,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()
      .run()
    const tender = tx
      .select()
      .from(schema.tenders)
      .where(
        and(
          eq(schema.tenders.partner, input.partner),
          eq(schema.tenders.tenderNumber, tenderNumber)
        )
      )
      .get()!

    const existing = tx
      .select()
      .from(schema.tenderVersions)
      .where(eq(schema.tenderVersions.documentId, input.documentId))
      .get()
    let version: number
    if (existing) {
      version = existing.version
      tx.update(schema.tenderVersions)
        .set({
          purpose: parsed.purpose,
          tender: blockText,
          respondBy: parsed.respondBy,
        })
        .where(eq(schema.tenderVersions.id, existing.id))
        .run()
    } else {
      const latest = tx
        .select({ version: schema.tenderVersions.version })
        .from(schema.tenderVersions)
        .where(eq(schema.tenderVersions.tenderId, tender.id))
        .orderBy(desc(schema.tenderVersions.version))
        .get()
      version = (latest?.version ?? 0) + 1
      tx.insert(schema.tenderVersions)
        .values({
          tenderId: tender.id,
          documentId: input.documentId,
          version,
          purpose: parsed.purpose,
          tender: blockText,
          respondBy: parsed.respondBy,
          receivedAt: at,
        })
        .run()
    }

    if (version >= tender.version) {
      const cancelled = parsed.purpose === "01"
      tx.update(schema.tenders)
        .set({
          ...parsed.summary,
          version,
          purpose: parsed.purpose,
          tender: blockText,
          // A change needs a new answer; a cancel needs none.
          status: cancelled
            ? "cancelled"
            : version === tender.version
              ? tender.status
              : "open",
          updatedAt: at,
        })
        .where(eq(schema.tenders.id, tender.id))
        .run()
      if (cancelled) {
        tx.update(schema.loads)
          .set({ status: "cancelled", updatedAt: at })
          .where(eq(schema.loads.tenderId, tender.id))
          .run()
      }
    }
  })
  return { status: "processed", reference: tenderNumber }
}

/**
 * Records a 990 as the answer to the tender version that was current when
 * it went out. An accept books a load.
 */
export function recordResponse(input: DocumentInput): Recorded {
  const parsed = parse990(input.document)
  const tender = findTender(input.partner, parsed.shipmentId)
  if (!tender) return noTender(parsed.shipmentId)

  const answered = db
    .select({ version: schema.tenderVersions.version })
    .from(schema.tenderVersions)
    .where(
      and(
        eq(schema.tenderVersions.tenderId, tender.id),
        lte(schema.tenderVersions.receivedAt, input.at)
      )
    )
    .orderBy(desc(schema.tenderVersions.version))
    .get()
  const version = answered?.version ?? tender.version

  const earlier = db
    .select()
    .from(schema.tenderResponses)
    .where(
      and(
        eq(schema.tenderResponses.tenderId, tender.id),
        eq(schema.tenderResponses.version, version)
      )
    )
    .get()
  if (earlier && earlier.documentId !== input.documentId) {
    return {
      status: "skipped",
      reference: parsed.shipmentId,
      note: `Version ${version} of tender ${parsed.shipmentId} was already answered; the first answer counts.`,
    }
  }

  const accept = parsed.code === "A"
  const at = input.at
  db.transaction((tx) => {
    const row = {
      tenderId: tender.id,
      documentId: input.documentId,
      version,
      code: parsed.code,
      loadNumber: parsed.loadNumber,
      declineReason: parsed.declineReason,
      date: parsed.date,
      createdAt: at,
    }
    tx.insert(schema.tenderResponses)
      .values(row)
      .onConflictDoUpdate({
        target: [
          schema.tenderResponses.tenderId,
          schema.tenderResponses.version,
        ],
        set: row,
      })
      .run()
    // Answering an older version leaves the tender's state to the newer one.
    if (version === tender.version && tender.status !== "cancelled") {
      tx.update(schema.tenders)
        .set({ status: accept ? "accepted" : "declined", updatedAt: at })
        .where(eq(schema.tenders.id, tender.id))
        .run()
    }
    if (accept) {
      tx.insert(schema.loads)
        .values({
          // Until a 214 names it, a load without a number goes by its tender.
          loadNumber: parsed.loadNumber ?? tender.tenderNumber,
          tenderId: tender.id,
          // Accepting a version the partner has since cancelled.
          status: tender.status === "cancelled" ? "cancelled" : "booked",
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing()
        .run()
    }
  })
  return {
    status: "processed",
    reference: parsed.loadNumber ?? parsed.shipmentId,
  }
}

const LOAD_STATUS: Record<string, Load["status"]> = {
  X3: "at_pickup",
  AF: "in_transit",
  X6: "in_transit",
  X1: "at_delivery",
  D1: "delivered",
}

// Milestones in the order they happen. 214s can go out late and out of
// order (a D1 before its X1), so a load only ever moves forward.
const PROGRESS: Load["status"][] = [
  "booked",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
]

/**
 * Records a 214's events against the load for its tender. A 214 for a
 * tender whose 990 was never seen still books the load: the carrier is
 * moving it. Appointments and estimates leave the load's status alone;
 * milestones move it forward.
 */
export function recordStatus(input: DocumentInput): Recorded {
  const parsed = parse214(input.document)
  const tender = findTender(input.partner, parsed.shipmentId)
  if (!tender) return noTender(parsed.shipmentId)

  const stops = (JSON.parse(tender.tender) as { stops: TenderStop[] }).stops
  const at = input.at

  const load = db.transaction((tx) => {
    tx.insert(schema.loads)
      .values({
        loadNumber: parsed.loadNumber ?? tender.tenderNumber,
        tenderId: tender.id,
        status: tender.status === "cancelled" ? "cancelled" : "booked",
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing()
      .run()
    let load = tx
      .select()
      .from(schema.loads)
      .where(eq(schema.loads.tenderId, tender.id))
      .get()!
    if (
      parsed.loadNumber &&
      load.loadNumber === tender.tenderNumber &&
      parsed.loadNumber !== load.loadNumber
    ) {
      tx.update(schema.loads)
        .set({ loadNumber: parsed.loadNumber })
        .where(eq(schema.loads.id, load.id))
        .run()
    }

    parsed.events.forEach((event, ordinal) => {
      const row = {
        loadId: load.id,
        documentId: input.documentId,
        ordinal,
        type: event.type,
        code: event.code,
        reasonCode: event.reasonCode,
        date: event.date,
        time: event.time,
        timeCode: event.timeCode,
        stopSequence: parsed.stopSequence,
        location: JSON.stringify(placeEvent(event, parsed.stopSequence, stops)),
        createdAt: at,
      }
      tx.insert(schema.statusEvents)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.statusEvents.documentId, schema.statusEvents.ordinal],
          set: row,
        })
        .run()

      const next = event.type === "status" ? LOAD_STATUS[event.code] : undefined
      if (
        next &&
        load.status !== "cancelled" &&
        PROGRESS.indexOf(next) > PROGRESS.indexOf(load.status)
      ) {
        tx.update(schema.loads)
          .set({ status: next, updatedAt: at })
          .where(eq(schema.loads.id, load.id))
          .run()
        load = { ...load, status: next }
      }
    })
    return load
  })
  return {
    status: "processed",
    reference: parsed.loadNumber ?? load.loadNumber,
  }
}

function findTender(partner: string, tenderNumber: string): Tender | undefined {
  return db
    .select()
    .from(schema.tenders)
    .where(
      and(
        eq(schema.tenders.partner, partner),
        eq(schema.tenders.tenderNumber, tenderNumber)
      )
    )
    .get()
}

function noTender(shipmentId: string): Recorded {
  return {
    status: "skipped",
    reference: shipmentId,
    note: `No 204 for tender ${shipmentId} has been synced, so there is nothing to attach this to. Its 204 may be older than the sync window.`,
  }
}

/** Empties the domain tables, for a rebuild from the synced documents. */
export function clearDomainTables(): void {
  db.transaction((tx) => {
    tx.delete(schema.statusEvents).run()
    tx.delete(schema.loads).run()
    tx.delete(schema.tenderResponses).run()
    tx.delete(schema.tenderVersions).run()
    tx.delete(schema.tenders).run()
  })
}
