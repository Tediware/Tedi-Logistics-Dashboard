import { Badge } from "@/components/ui/badge"
import type { SyncedDocument } from "@/db/schema"
import { cn } from "@/lib/utils"

const documentLabel: Record<SyncedDocument["status"], string> = {
  pending: "Pending",
  processed: "Processed",
  skipped: "Skipped",
  failed: "Failed",
}

/** What the app did with a synced document. */
export function DocumentStatusBadge({
  status,
}: {
  status: SyncedDocument["status"]
}) {
  return (
    <Badge
      variant={
        status === "failed"
          ? "destructive"
          : status === "processed"
            ? "default"
            : "outline"
      }
    >
      {documentLabel[status]}
    </Badge>
  )
}

/** A message in a panel: destructive for failures, muted otherwise. */
export function NotePanel({
  title,
  message,
  tone = "muted",
  className,
}: {
  title: string
  message: string
  tone?: "muted" | "destructive"
  className?: string
}) {
  return (
    <div
      className={cn(
        "space-y-1 rounded-lg border p-3 text-sm",
        tone === "destructive"
          ? "border-destructive/30 bg-destructive/5"
          : "bg-muted/50",
        className
      )}
    >
      <div
        className={cn(
          "font-medium",
          tone === "destructive" && "text-destructive"
        )}
      >
        {title}
      </div>
      <p className="leading-relaxed break-words">{message}</p>
    </div>
  )
}

/** A dashed placeholder for an empty list. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** A label/value grid for record metadata. */
export function Fields({
  items,
}: {
  items: [label: string, value: React.ReactNode][]
}) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all">{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  )
}
