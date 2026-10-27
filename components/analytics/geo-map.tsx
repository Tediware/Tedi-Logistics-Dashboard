"use client"

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
} from "maplibre-gl"
import { useRouter } from "next/navigation"
import * as React from "react"

import { NorthAmericaMap, type Mode } from "@/components/north-america-map"
import type { Load } from "@/db/schema"
import type { Facility, GeoPicture, LaneStat, Truck } from "@/lib/analytics/geo"
import { arc } from "@/lib/geo/arc"
import { cn } from "@/lib/utils"

type Role = "pickup" | "delivery" | "both"

// Lanes fade from the pickup color to the delivery color, so direction
// reads without arrows. Truck colors follow the load status badges. Dark
// deliveries stay off orange, the color of the country outline.
const COLORS: Record<
  Mode,
  {
    roles: Record<Role, string>
    trucks: Record<"stop" | "moving", string>
    halo: string
  }
> = {
  light: {
    roles: { pickup: "#0d9488", delivery: "#4f46e5", both: "#a21caf" },
    trucks: { stop: "#f59e0b", moving: "#0ea5e9" },
    halo: "#ffffff",
  },
  dark: {
    roles: { pickup: "#2dd4bf", delivery: "#a78bfa", both: "#f472b6" },
    trucks: { stop: "#fbbf24", moving: "#38bdf8" },
    halo: "#1a1817",
  },
}

const truckKind = (status: Load["status"]) =>
  status === "in_transit" ? "moving" : "stop"

const LAYERS = ["trucks", "facilities", "lanes-hit"] as const

type Hover =
  | { kind: "facility"; item: Facility; x: number; y: number }
  | { kind: "lane"; item: LaneStat; x: number; y: number }
  | { kind: "truck"; item: Truck; x: number; y: number }

function toGeoJSON(data: GeoPicture) {
  const maxLane = Math.max(1, ...data.lanes.map((l) => l.tenders))
  const maxStops = Math.max(
    1,
    ...data.facilities.map((f) => f.pickups + f.deliveries)
  )
  return {
    lanes: {
      type: "FeatureCollection" as const,
      features: data.lanes.map((l) => ({
        type: "Feature" as const,
        properties: { key: l.key, weight: Math.sqrt(l.tenders / maxLane) },
        geometry: {
          type: "LineString" as const,
          coordinates: arc(l.from, l.to),
        },
      })),
    },
    facilities: {
      type: "FeatureCollection" as const,
      features: data.facilities.map((f) => ({
        type: "Feature" as const,
        properties: {
          key: f.key,
          role: role(f),
          weight: Math.sqrt((f.pickups + f.deliveries) / maxStops),
        },
        geometry: { type: "Point" as const, coordinates: f.position },
      })),
    },
    trucks: {
      type: "FeatureCollection" as const,
      features: data.trucks.map((t) => ({
        type: "Feature" as const,
        properties: { key: t.loadNumber, kind: truckKind(t.status) },
        geometry: { type: "Point" as const, coordinates: t.position },
      })),
    },
  }
}

function role(f: Facility): Role {
  return f.pickups && f.deliveries ? "both" : f.pickups ? "pickup" : "delivery"
}

function addLayers(map: MapLibreMap, mode: Mode, data: GeoPicture) {
  const c = COLORS[mode]
  const geo = toGeoJSON(data)
  // Lanes go under the place labels; points sit on top of everything.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id

  map.addSource("lanes", {
    type: "geojson",
    data: geo.lanes,
    lineMetrics: true,
  })
  map.addSource("facilities", { type: "geojson", data: geo.facilities })
  map.addSource("trucks", { type: "geojson", data: geo.trucks })

  const width: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["get", "weight"],
    0,
    1.5,
    1,
    8,
  ]
  map.addLayer(
    {
      id: "lanes-line",
      type: "line",
      source: "lanes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": width,
        "line-opacity": 0.85,
        "line-gradient": [
          "interpolate",
          ["linear"],
          ["line-progress"],
          0,
          c.roles.pickup,
          1,
          c.roles.delivery,
        ],
      },
    },
    firstSymbol
  )
  // A wide invisible twin, so thin lanes are easy to hover.
  map.addLayer(
    {
      id: "lanes-hit",
      type: "line",
      source: "lanes",
      paint: { "line-width": 16, "line-opacity": 0 },
    },
    firstSymbol
  )
  map.addLayer({
    id: "facilities",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["get", "weight"],
        0,
        4,
        1,
        16,
      ],
      "circle-color": [
        "match",
        ["get", "role"],
        "pickup",
        c.roles.pickup,
        "delivery",
        c.roles.delivery,
        c.roles.both,
      ],
      "circle-opacity": 0.9,
      "circle-stroke-color": c.halo,
      "circle-stroke-width": 1.5,
    },
  })
  map.addLayer({
    id: "trucks",
    type: "circle",
    source: "trucks",
    paint: {
      "circle-radius": 5.5,
      "circle-color": [
        "match",
        ["get", "kind"],
        "moving",
        c.trucks.moving,
        c.trucks.stop,
      ],
      "circle-stroke-color": c.halo,
      "circle-stroke-width": 2,
    },
  })
}

/**
 * Facilities, lanes and trucks on the North America globe. Data arrives as
 * props from the server page; each refresh updates the sources in place, so
 * the camera stays where the viewer left it.
 */
export function GeoMap({ data }: { data: GeoPicture }) {
  const router = useRouter()
  const mapRef = React.useRef<MapLibreMap | null>(null)
  const dataRef = React.useRef(data)
  const framed = React.useRef(false)
  const [hover, setHover] = React.useState<Hover | null>(null)

  const lookup = React.useMemo(
    () => ({
      facility: new Map(data.facilities.map((f) => [f.key, f])),
      lane: new Map(data.lanes.map((l) => [l.key, l])),
      truck: new Map(data.trucks.map((t) => [t.loadNumber, t])),
    }),
    [data]
  )
  const lookupRef = React.useRef(lookup)

  React.useEffect(() => {
    dataRef.current = data
    lookupRef.current = lookup
    const map = mapRef.current
    if (!map?.getSource("lanes")) return
    const geo = toGeoJSON(data)
    ;(map.getSource("lanes") as GeoJSONSource).setData(geo.lanes)
    ;(map.getSource("facilities") as GeoJSONSource).setData(geo.facilities)
    ;(map.getSource("trucks") as GeoJSONSource).setData(geo.trucks)
    setHover(null)
  }, [data, lookup])

  const onStyleLoad = React.useCallback(
    (map: MapLibreMap, mode: Mode) => {
      addLayers(map, mode, dataRef.current)
      if (mapRef.current === map) return

      // First load only: frame the data, and wire hovering once, since
      // handlers outlive style changes.
      mapRef.current = map
      const points = dataRef.current.facilities.map((f) => f.position)
      if (points.length && !framed.current) {
        framed.current = true
        const lngs = points.map((p) => p[0])
        const lats = points.map((p) => p[1])
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 80, maxZoom: 6, duration: 0 }
        )
      }

      const pick = (e: MapMouseEvent) => {
        if (!LAYERS.every((id) => map.getLayer(id))) return null
        const feature = map.queryRenderedFeatures(e.point, {
          layers: [...LAYERS],
        })[0]
        if (!feature) return null
        const key = feature.properties.key as string
        const x = e.point.x
        const y = e.point.y
        const l = lookupRef.current
        if (feature.layer.id === "trucks") {
          const item = l.truck.get(key)
          return item ? ({ kind: "truck", item, x, y } as const) : null
        }
        if (feature.layer.id === "facilities") {
          const item = l.facility.get(key)
          return item ? ({ kind: "facility", item, x, y } as const) : null
        }
        const item = l.lane.get(key)
        return item ? ({ kind: "lane", item, x, y } as const) : null
      }
      map.on("mousemove", (e) => {
        const hit = pick(e)
        map.getCanvas().style.cursor = hit?.kind === "truck" ? "pointer" : ""
        setHover(hit)
      })
      map.on("mouseout", () => setHover(null))
      map.on("click", (e) => {
        const hit = pick(e)
        if (hit?.kind === "truck") router.push(`/tenders/${hit.item.tenderId}`)
      })
    },
    [router]
  )

  return (
    <div className="relative">
      <NorthAmericaMap
        onStyleLoad={onStyleLoad}
        className="h-[calc(100dvh-12rem)]"
      />
      {hover && <Tooltip hover={hover} />}
      <Legend unplaced={data.unplaced} />
    </div>
  )
}

function Tooltip({ hover }: { hover: Hover }) {
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-72 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      {hover.kind === "facility" && <FacilityTip f={hover.item} />}
      {hover.kind === "lane" && <LaneTip l={hover.item} />}
      {hover.kind === "truck" && <TruckTip t={hover.item} />}
    </div>
  )
}

function FacilityTip({ f }: { f: Facility }) {
  return (
    <>
      <div className="font-medium">{f.name}</div>
      <div className="text-muted-foreground">{f.place}</div>
      <div className="mt-1 tabular-nums">
        {[
          f.pickups && plural(f.pickups, "pickup"),
          f.deliveries && plural(f.deliveries, "delivery", "deliveries"),
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </>
  )
}

function LaneTip({ l }: { l: LaneStat }) {
  const answered = [
    l.accepted && `${l.accepted} accepted`,
    l.declined && `${l.declined} declined`,
    l.cancelled && `${l.cancelled} cancelled`,
    l.open && `${l.open} waiting`,
  ].filter(Boolean)
  return (
    <>
      <div className="font-medium">
        {l.origin} <span className="text-muted-foreground">→</span>{" "}
        {l.destination}
      </div>
      <div className="mt-1 tabular-nums">
        {plural(l.tenders, "tender")}
        {answered.length > 0 && (
          <span className="text-muted-foreground">: {answered.join(", ")}</span>
        )}
      </div>
      <div className="text-muted-foreground tabular-nums">
        {l.delivered} delivered
        {l.onTheRoad > 0 && `, ${l.onTheRoad} on the road`}
      </div>
    </>
  )
}

function TruckTip({ t }: { t: Truck }) {
  return (
    <>
      <div className="font-medium">
        {t.loadNumber}{" "}
        <span className="font-normal text-muted-foreground">
          · {t.statusLabel}
        </span>
      </div>
      <div>
        {t.origin} <span className="text-muted-foreground">→</span>{" "}
        {t.destination}
      </div>
      {t.lastUpdate && (
        <div className="mt-1 text-muted-foreground">{t.lastUpdate}</div>
      )}
      {t.estimated && (
        <div className="text-muted-foreground">
          Position estimated from the schedule
        </div>
      )}
    </>
  )
}

/**
 * Both themes' colors go in as CSS variables and the dark variant picks, so
 * the server render matches the client's whatever the theme.
 */
function Legend({ unplaced }: { unplaced: string[] }) {
  const swatch = (pick: (c: (typeof COLORS)[Mode]) => string) =>
    ({
      "--light": pick(COLORS.light),
      "--dark": pick(COLORS.dark),
    }) as React.CSSProperties
  const dot = (
    pick: (c: (typeof COLORS)[Mode]) => string,
    label: string,
    size = "size-2.5"
  ) => (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "rounded-full bg-(--light) ring-1 ring-background dark:bg-(--dark)",
          size
        )}
        style={swatch(pick)}
      />
      {label}
    </span>
  )
  return (
    <div className="absolute bottom-2 left-2 z-10 max-w-[calc(100%-1rem)] space-y-1 rounded-md border bg-background/85 px-2.5 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {dot((c) => c.roles.pickup, "Pickup")}
        {dot((c) => c.roles.delivery, "Delivery")}
        {dot((c) => c.roles.both, "Pickup and delivery")}
        <span className="flex items-center gap-1.5">
          <span
            className="h-1 w-6 rounded-full bg-linear-to-r from-(--from-light) to-(--to-light) dark:from-(--from-dark) dark:to-(--to-dark)"
            style={
              {
                "--from-light": COLORS.light.roles.pickup,
                "--to-light": COLORS.light.roles.delivery,
                "--from-dark": COLORS.dark.roles.pickup,
                "--to-dark": COLORS.dark.roles.delivery,
              } as React.CSSProperties
            }
          />
          Lane, wider for more tenders
        </span>
        {dot((c) => c.trucks.stop, "Load at a stop", "size-2")}
        {dot((c) => c.trucks.moving, "Load in transit", "size-2")}
      </div>
      <div className="text-[0.625rem]">
        Facilities at postal code centers (GeoNames, CC BY 4.0)
        {unplaced.length > 0 &&
          `. Not shown, no postal code match: ${unplaced.join("; ")}`}
      </div>
    </div>
  )
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
