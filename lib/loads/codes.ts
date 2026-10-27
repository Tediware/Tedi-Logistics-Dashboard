import type { Load, Tender } from "@/db/schema"

/** What the 214 status codes this carrier sends mean, in plain words. */
export const STATUS_LABELS: Record<string, string> = {
  AA: "Pickup appointment",
  AB: "Delivery appointment",
  AG: "Estimated delivery",
  X3: "Arrived at pickup",
  AF: "Departed pickup",
  X6: "En route",
  X1: "Arrived at delivery",
  D1: "Delivered",
}

export const LOAD_STATUS_LABELS: Record<Load["status"], string> = {
  booked: "Booked",
  at_pickup: "At pickup",
  in_transit: "In transit",
  at_delivery: "At delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
}

export const TENDER_STATUS_LABELS: Record<Tender["status"], string> = {
  open: "Needs an answer",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
}

/** B2A-01 on a 204. */
export const PURPOSE_LABELS: Record<string, string> = {
  "00": "Original",
  "01": "Cancel",
  "04": "Change",
}
