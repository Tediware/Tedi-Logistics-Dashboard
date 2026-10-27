import { Badge } from "@/components/ui/badge"
import type { Load, StatusEventRow, Tender } from "@/db/schema"
import { formatRelative, formatWallClock } from "@/lib/format"
import {
  LOAD_STATUS_LABELS,
  STATUS_LABELS,
  TENDER_STATUS_LABELS,
} from "@/lib/loads/codes"
import { stopTimeToMs } from "@/lib/time-zones"
import { cn } from "@/lib/utils"

/** Where a tender stands with the carrier. */
export function TenderStatusBadge({ status }: { status: Tender["status"] }) {
  return (
    <Badge
      variant={
        status === "open"
          ? "default"
          : status === "declined"
            ? "secondary"
            : "outline"
      }
      className={cn(status === "cancelled" && "text-muted-foreground")}
    >
      {TENDER_STATUS_LABELS[status]}
    </Badge>
  )
}

const LOAD_DOT: Record<Load["status"], string> = {
  booked: "bg-muted-foreground",
  at_pickup: "bg-amber-500",
  in_transit: "bg-sky-500",
  at_delivery: "bg-amber-500",
  delivered: "bg-emerald-500",
  cancelled: "",
}

/** Where a load is between pickup and delivery. */
export function LoadStatusBadge({ status }: { status: Load["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        status === "cancelled" && "text-muted-foreground"
      )}
    >
      {status !== "cancelled" && (
        <span className={cn("size-1.5 rounded-full", LOAD_DOT[status])} />
      )}
      {LOAD_STATUS_LABELS[status]}
    </Badge>
  )
}

/** "Schenectady, NY → Brampton, ON", with the facility names on hover. */
export function Lane({ tender }: { tender: Tender }) {
  const place = (city: string | null, state: string | null) =>
    [titleCase(city), state].filter(Boolean).join(", ") || "-"
  return (
    <span
      title={[tender.originName, tender.destinationName]
        .filter(Boolean)
        .join(" → ")}
    >
      {place(tender.originCity, tender.originState)}
      <span className="text-muted-foreground"> → </span>
      {place(tender.destinationCity, tender.destinationState)}
    </span>
  )
}

/** 204s shout; screens do not. "SCHENECTADY" -> "Schenectady". */
export function titleCase(value: string | null | undefined): string {
  if (!value) return ""
  return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** "42,180 lb". L is pounds and K kilograms on a 204. */
export function formatWeight(
  weight: number | null,
  unit: string | null
): string {
  if (weight === null) return "-"
  return `${Math.round(weight).toLocaleString("en-US")} ${unit === "K" ? "kg" : "lb"}`
}

/** A stop's appointment as the 204 gave it, with a countdown. */
export function StopTime({
  tender,
  stop,
  now,
}: {
  tender: Tender
  stop: "pickup" | "delivery"
  now: number
}) {
  const local = stop === "pickup" ? tender.pickupAt : tender.deliveryAt
  const state = stop === "pickup" ? tender.originState : tender.destinationState
  const at = stopTimeToMs(local, state)
  return (
    <span>
      {formatWallClock(local)}
      {at !== null && (
        <span className="text-muted-foreground">
          {" "}
          · {formatRelative(at, now)}
        </span>
      )}
    </span>
  )
}

/** "Departed pickup · Schenectady, NY · Wed Nov 4, 09:12 ET" */
export function EventSummary({ event }: { event: StatusEventRow }) {
  const location = JSON.parse(event.location) as {
    city?: string
    state?: string
  }
  return (
    <span>
      {STATUS_LABELS[event.code] ?? event.code}
      <span className="text-muted-foreground">
        {" · "}
        {[titleCase(location.city), location.state].filter(Boolean).join(", ")}
        {" · "}
        {formatWallClock(`${event.date}T${event.time}`)} {event.timeCode}
      </span>
    </span>
  )
}
