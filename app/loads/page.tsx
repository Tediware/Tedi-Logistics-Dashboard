import Link from "next/link"

import { AutoRefresh } from "@/components/auto-refresh"
import {
  EventSummary,
  Lane,
  LoadStatusBadge,
  StopTime,
  formatWeight,
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
import { formatRelative, formatTime } from "@/lib/format"
import {
  getLoads,
  getRecentStatusEvents,
  getTenders,
} from "@/lib/loads/queries"

export const dynamic = "force-dynamic"

const rowLink = "after:absolute after:inset-0"

export default function LoadsPage() {
  const now = requestNow()
  const open = getTenders({ status: ["open"] })
  const moving = getLoads({
    status: ["at_pickup", "in_transit", "at_delivery"],
  })
  const booked = getLoads({ status: ["booked"] })
  const delivered = getLoads({ status: ["delivered"] })
  const recent = getRecentStatusEvents(15)

  return (
    <div className="space-y-8">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loads</h1>
        <p className="text-sm text-muted-foreground">
          Tenders waiting for an answer, and every load from booking to
          delivery.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Need an answer" value={open.length} />
        <Stat label="Booked" value={booked.length} />
        <Stat label="On the road" value={moving.length} />
        <Stat label="Delivered" value={delivered.length} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Tenders waiting for an answer</h2>
        {open.length === 0 ? (
          <Empty>Every tender has been answered.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Tender</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map(({ tender: t }) => (
                  <TableRow key={t.id} className="relative hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">
                      {formatRelative(Date.parse(t.updatedAt), now)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/tenders/${t.id}`} className={rowLink}>
                        {t.tenderNumber}
                      </Link>
                      {t.version > 1 && (
                        <span className="text-muted-foreground">
                          {" "}
                          v{t.version}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Lane tender={t} />
                    </TableCell>
                    <TableCell>
                      <StopTime tender={t} stop="pickup" now={now} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatWeight(t.weight, t.weightUnitCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">On the road</h2>
        {moving.length === 0 ? (
          <Empty>No loads between pickup and delivery right now.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last update</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moving.map(({ load, tender, lastEvent }) => (
                  <TableRow
                    key={load.id}
                    className="relative hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <Link href={`/tenders/${tender.id}`} className={rowLink}>
                        {load.loadNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Lane tender={tender} />
                    </TableCell>
                    <TableCell>
                      <LoadStatusBadge status={load.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {lastEvent ? <EventSummary event={lastEvent} /> : "-"}
                    </TableCell>
                    <TableCell>
                      <StopTime tender={tender} stop="delivery" now={now} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Booked</h2>
        {booked.length === 0 ? (
          <Empty>No accepted loads waiting for pickup.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {booked.map(({ load, tender }) => (
                  <TableRow
                    key={load.id}
                    className="relative hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <Link href={`/tenders/${tender.id}`} className={rowLink}>
                        {load.loadNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Lane tender={tender} />
                    </TableCell>
                    <TableCell>
                      <StopTime tender={tender} stop="pickup" now={now} />
                    </TableCell>
                    <TableCell>
                      <StopTime tender={tender} stop="delivery" now={now} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Latest status updates</h2>
        {recent.length === 0 ? (
          <Empty>No status updates sent yet.</Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Load</TableHead>
                  <TableHead>Update</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map(({ event, load, tender }) => (
                  <TableRow
                    key={event.id}
                    className="relative hover:bg-muted/50"
                  >
                    <TableCell className="text-muted-foreground">
                      {formatTime(event.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/tenders/${tender.id}`} className={rowLink}>
                        {load.loadNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <EventSummary event={event} />
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  )
}
