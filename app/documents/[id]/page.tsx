import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { JsonViewer } from "@/components/json-viewer"
import { DocumentStatusBadge, Fields, NotePanel } from "@/components/status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatTime } from "@/lib/format"
import { getDocumentDetail } from "@/lib/queries"

export const dynamic = "force-dynamic"

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = getDocumentDetail(Number(id))
  if (!detail) notFound()
  const { document: d, tenderId } = detail

  return (
    <div className="space-y-6">
      <Link
        href="/activity"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Activity
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {d.transactionSet ?? "Document"}{" "}
            {d.direction === "inbound" ? "from" : "to"} {d.partner ?? "-"}
            {d.reference && (
              <span className="text-muted-foreground"> · {d.reference}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Processed by Tediware {formatTime(d.createdAt)}
          </p>
        </div>
        <DocumentStatusBadge status={d.status} />
      </div>

      {d.note && (
        <NotePanel
          tone={d.status === "failed" ? "destructive" : "muted"}
          title={d.status === "failed" ? "Could not be read" : "Note"}
          message={d.note}
        />
      )}
      {d.outcome === "error" && d.errorMessage && (
        <NotePanel
          tone="destructive"
          title="Tediware reported an error"
          message={d.errorMessage}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields
            items={[
              ["Direction", d.direction === "inbound" ? "Inbound" : "Outbound"],
              ["Partner", d.partner],
              ["Transaction set", d.transactionSet],
              [
                "Usage",
                d.usageIndicator === "T"
                  ? "Test"
                  : d.usageIndicator === "P"
                    ? "Production"
                    : null,
              ],
              ["Resend", d.resend ? "Yes" : "No"],
              [
                "Tender",
                tenderId ? (
                  <Link
                    href={`/tenders/${tenderId}`}
                    className="underline underline-offset-4"
                  >
                    View tender
                  </Link>
                ) : null,
              ],
              ["Trace", <code key="t">{d.traceGuid ?? "-"}</code>],
              ["Result", <code key="r">{d.resultExtid ?? "-"}</code>],
              ["Synced", formatTime(d.syncedAt)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {d.rawDocument ? (
            <>
              <p className="text-sm text-muted-foreground">
                The X12-shaped JSON, as downloaded from Tediware.
              </p>
              <JsonViewer value={d.rawDocument} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not downloaded: this app only downloads the documents it reads.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feed entry</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonViewer value={d.rawEntry} />
        </CardContent>
      </Card>
    </div>
  )
}
