import Link from "next/link"

import { AutoRefresh } from "@/components/auto-refresh"
import {
  Lane,
  LoadStatusBadge,
  StopTime,
  TenderStatusBadge,
} from "@/components/loads"
import { Empty } from "@/components/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requestNow } from "@/lib/clock"
import { formatTime } from "@/lib/format"
import { getTenders } from "@/lib/loads/queries"

export const dynamic = "force-dynamic"

const rowLink = "after:absolute after:inset-0"

export default function TendersPage() {
  const now = requestNow()
  const tenders = getTenders({ limit: 200 })

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenders</h1>
        <p className="text-sm text-muted-foreground">
          Every load tender (204) received from a partner, newest first, with
          the carrier&apos;s answer and the load it became.
        </p>
      </div>

      {tenders.length === 0 ? (
        <Empty>
          No tenders yet. They appear here when a partner&apos;s 204 arrives.
        </Empty>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Received</TableHead>
                <TableHead>Tender</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Lane</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Load</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenders.map(({ tender: t, load }) => (
                <TableRow key={t.id} className="relative hover:bg-muted/50">
                  <TableCell className="text-muted-foreground">
                    {formatTime(t.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/tenders/${t.id}`} className={rowLink}>
                      {t.tenderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{t.partner}</TableCell>
                  <TableCell>
                    <Lane tender={t} />
                  </TableCell>
                  <TableCell>
                    <StopTime tender={t} stop="pickup" now={now} />
                  </TableCell>
                  <TableCell>
                    <TenderStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    {load ? (
                      <span className="flex items-center gap-2">
                        {load.loadNumber}
                        <LoadStatusBadge status={load.status} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
