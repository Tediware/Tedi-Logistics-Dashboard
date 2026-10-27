import Link from "next/link"

import { ActionButton } from "@/components/action-button"
import { AutoRefresh } from "@/components/auto-refresh"
import {
  DocumentStatusBadge,
  Empty,
  Fields,
  NotePanel,
} from "@/components/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requestNow } from "@/lib/clock"
import { formatRelative, formatTime } from "@/lib/format"
import {
  DOCUMENT_FILTERS,
  getActivity,
  type DocumentFilter,
} from "@/lib/queries"
import { getSyncState, isSyncRunning } from "@/lib/sync"
import { isApiConfigured, syncIntervalSeconds } from "@/lib/tediware"
import { cn } from "@/lib/utils"

import { syncNow } from "./actions"

// Reads live DB state; never serve a build-time snapshot.
export const dynamic = "force-dynamic"

const rowLink = "after:absolute after:inset-0"

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const { show } = await searchParams
  const filter: DocumentFilter =
    DOCUMENT_FILTERS.find((f) => f.value === show)?.value ?? "all"
  const { documents, counts, total, latest } = getActivity(filter)
  const state = getSyncState()
  const configured = isApiConfigured()
  const interval = syncIntervalSeconds()
  const now = requestNow()

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="text-sm text-muted-foreground">
            Every document read from the Tediware feed, newest first, and what
            this app made of it. Nothing is ever sent back.
          </p>
        </div>
        <ActionButton
          action={syncNow}
          label="Sync now"
          pendingLabel="Syncing…"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sync</h2>
        {!configured && (
          <NotePanel
            title="Not connected"
            message="Create a read-only API key in your Tediware account, set it as TEDIWARE_API_KEY in .env.local, and restart the app."
          />
        )}
        {state?.lastError && (
          <NotePanel
            tone="destructive"
            title="The last sync stopped early"
            message={`${state.lastError} The next sync starts again from where it stopped.`}
          />
        )}
        <div className="rounded-lg border p-4">
          <Fields
            items={[
              [
                "Status",
                isSyncRunning()
                  ? "Syncing"
                  : !configured
                    ? "Waiting for an API key"
                    : interval
                      ? `Every ${interval} seconds`
                      : "Background sync off; use Sync now",
              ],
              [
                "Last sync",
                state?.lastSuccessAt
                  ? `${formatTime(state.lastSuccessAt)} (${formatRelative(Date.parse(state.lastSuccessAt), now)})`
                  : "Never",
              ],
              [
                "Read from",
                state
                  ? formatTime(state.since)
                  : "45 days ago, on the first sync",
              ],
              ["Newest document", latest ? formatTime(latest) : "-"],
              [
                "Documents",
                `${total} read: ${counts.processed} processed, ${counts.skipped} skipped, ${counts.failed} failed`,
              ],
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Documents</h2>
          <div className="flex h-8 items-center rounded-md border p-0.5 text-xs">
            {DOCUMENT_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={
                  f.value === "all" ? "/activity" : `/activity?show=${f.value}`
                }
                scroll={false}
                className={cn(
                  "flex h-full items-center rounded px-2.5 text-muted-foreground transition-colors hover:text-foreground",
                  f.value === filter && "bg-muted font-medium text-foreground"
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        {documents.length === 0 ? (
          <Empty>
            {total === 0
              ? "Nothing synced yet."
              : "No documents with this status."}
          </Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Processed by Tediware</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id} className="relative hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">
                      <Link href={`/documents/${d.id}`} className={rowLink}>
                        {formatTime(d.createdAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {d.direction === "inbound" ? "In" : "Out"}
                    </TableCell>
                    <TableCell>{d.partner ?? "-"}</TableCell>
                    <TableCell>
                      {d.transactionSet ?? "-"}
                      {d.usageIndicator === "T" && (
                        <span className="text-muted-foreground"> (test)</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {d.reference ?? "-"}
                    </TableCell>
                    <TableCell>
                      <DocumentStatusBadge status={d.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
