"use client"

import { ChevronDown } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  filtersHref,
  toggleShipper,
  type AnalyticsFilters,
} from "@/lib/analytics/filters"
import type { ShipperOption } from "@/lib/analytics/scope"
import { cn } from "@/lib/utils"

/**
 * The shipper filter, folded into one button. The checkboxes are this
 * component's own state, so they flip at once and stay flipped; the URL
 * follows once clicking pauses, in a single navigation. Until that lands,
 * a re-render from the page's auto-refresh carries the old URL's shippers
 * and must not undo the clicks, so the URL's state is adopted only when it
 * is the one this picker asked for, or when nothing is pending.
 */
export function ShipperPicker({
  filters,
  shippers,
}: {
  filters: AnalyticsFilters
  shippers: ShipperOption[]
}) {
  const router = useRouter()
  const [hiddenList, setHiddenList] = useState(filters.hiddenShippers)
  const [pending, setPending] = useState<string | null>(null)
  const urlKey = filters.hiddenShippers.join(",")
  const [seenUrlKey, setSeenUrlKey] = useState(urlKey)
  if (urlKey !== seenUrlKey) {
    setSeenUrlKey(urlKey)
    if (pending === null || pending === urlKey) {
      setHiddenList(filters.hiddenShippers)
      setPending(null)
    }
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const hidden = new Set(hiddenList)
  const shown = shippers.filter((s) => !hidden.has(s.key)).length
  const current = { ...filters, hiddenShippers: hiddenList }
  const keys = shippers.map((s) => s.key)

  const apply = (change: AnalyticsFilters) => {
    // Sorted as parseFilters sorts, so the key matches the URL's once it lands.
    const next = {
      ...change,
      hiddenShippers: [...change.hiddenShippers].sort(),
    }
    const key = next.hiddenShippers.join(",")
    setHiddenList(next.hiddenShippers)
    clearTimeout(timer.current)
    if (key === urlKey) {
      setPending(null)
      return
    }
    setPending(key)
    timer.current = setTimeout(
      () => router.replace(filtersHref(next), { scroll: false }),
      300
    )
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="lg" />}>
        Shippers
        <span className="font-normal text-muted-foreground">
          {shown === shippers.length ? "All" : `${shown} of ${shippers.length}`}
        </span>
        <ChevronDown data-icon="inline-end" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="font-medium">Shippers</span>
          <span className="flex gap-1">
            <Button
              variant="ghost"
              size="xs"
              disabled={shown === shippers.length}
              onClick={() => apply({ ...current, hiddenShippers: [] })}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={shown === 0}
              onClick={() => apply({ ...current, hiddenShippers: keys })}
            >
              None
            </Button>
          </span>
        </div>
        {shippers.length === 0 && (
          <p className="px-2 py-1.5 text-muted-foreground">No tenders yet.</p>
        )}
        {shippers.map((s) => {
          const checked = !hidden.has(s.key)
          return (
            <div
              key={s.key}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => apply(toggleShipper(current, s.key))}
                />
                <span
                  className={cn(
                    "truncate",
                    !checked && "text-muted-foreground"
                  )}
                >
                  {s.name}
                </span>
              </label>
              <button
                type="button"
                className="hidden text-muted-foreground group-hover:inline hover:text-foreground"
                onClick={() =>
                  apply({
                    ...current,
                    hiddenShippers: keys.filter((k) => k !== s.key),
                  })
                }
              >
                Only
              </button>
              <span className="text-muted-foreground group-hover:hidden">
                {s.partner}
              </span>
              <span className="w-8 text-right text-muted-foreground tabular-nums">
                {s.tenders}
              </span>
            </div>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
