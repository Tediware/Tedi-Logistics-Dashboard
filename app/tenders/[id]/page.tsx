import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { AutoRefresh } from "@/components/auto-refresh"
import { JsonViewer } from "@/components/json-viewer"
import {
  EventSummary,
  Lane,
  LoadStatusBadge,
  StopTime,
  TenderStatusBadge,
  formatWeight,
  titleCase,
} from "@/components/loads"
import { Fields } from "@/components/status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requestNow } from "@/lib/clock"
import { formatTime } from "@/lib/format"
import { PURPOSE_LABELS } from "@/lib/loads/codes"
import { getTenderDetail } from "@/lib/loads/queries"
import type { TenderBlock } from "@/lib/loads/tender"

export const dynamic = "force-dynamic"

type Entry = {
  at: string
  key: string
  title: React.ReactNode
  detail?: React.ReactNode
  /** The audit page showing the document exactly as it was synced. */
  href: string
}

export default async function TenderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = getTenderDetail(Number(id))
  if (!detail) notFound()
  const { tender: t, versions, responses, load, events } = detail
  const now = requestNow()
  const block = JSON.parse(t.tender) as TenderBlock

  const entries: Entry[] = [
    ...versions.map((v) => ({
      at: v.receivedAt,
      key: `v${v.id}`,
      title: `204 received: ${PURPOSE_LABELS[v.purpose] ?? v.purpose}${v.version > 1 ? ` (v${v.version})` : ""}`,
      href: `/documents/${v.documentId}`,
    })),
    ...responses.map((r) => ({
      at: r.createdAt,
      key: `r${r.id}`,
      title:
        r.code === "A"
          ? `990 sent: accepted${r.loadNumber ? ` as ${r.loadNumber}` : ""}`
          : `990 sent: declined`,
      detail: r.declineReason,
      href: `/documents/${r.documentId}`,
    })),
    ...events.map((e) => ({
      at: e.createdAt,
      key: `e${e.id}`,
      title: "214 sent",
      detail: <EventSummary event={e} />,
      href: `/documents/${e.documentId}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <Link
        href="/tenders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Tenders
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tender {t.tenderNumber}
            {load && (
              <span className="text-muted-foreground">
                {" "}
                · load {load.loadNumber}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            From {t.partner}, received {formatTime(t.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TenderStatusBadge status={t.status} />
          {load && <LoadStatusBadge status={load.status} />}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shipment</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields
            items={[
              ["Lane", <Lane key="l" tender={t} />],
              [
                "Pickup",
                <StopTime key="p" tender={t} stop="pickup" now={now} />,
              ],
              [
                "Delivery",
                <StopTime key="d" tender={t} stop="delivery" now={now} />,
              ],
              ["Weight", formatWeight(t.weight, t.weightUnitCode)],
              ["Handling units", t.handlingUnits],
              ["Current version", `v${t.version}`],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stops</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {block.stops.map((stop) => (
              <li key={stop.sequence} className="flex gap-3">
                <span className="w-16 shrink-0 text-muted-foreground">
                  {stop.sequence}.{" "}
                  {stop.type === "pickup" ? "Pickup" : "Delivery"}
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{titleCase(stop.name)}</span>
                  <span className="block text-muted-foreground">
                    {[
                      stop.address.line1,
                      titleCase(stop.address.city),
                      `${stop.address.state} ${stop.address.postalCode}`,
                      stop.address.country,
                    ].join(", ")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm">
            {entries.map((entry) => (
              <li
                key={entry.key}
                className="grid grid-cols-[9rem_1fr_auto] items-baseline gap-3"
              >
                <span className="text-muted-foreground tabular-nums">
                  {formatTime(entry.at)}
                </span>
                <span className="min-w-0">
                  {entry.title}
                  {entry.detail && (
                    <span className="block text-muted-foreground">
                      {entry.detail}
                    </span>
                  )}
                </span>
                <Link
                  href={entry.href}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  View
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tender block</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Every stop and reference from the current 204, as this app reads it.
          </p>
          <JsonViewer value={block} />
        </CardContent>
      </Card>
    </div>
  )
}
