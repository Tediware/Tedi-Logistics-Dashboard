"use client"

import "maplibre-gl/dist/maplibre-gl.css"

import * as React from "react"
import type {
  ExpressionSpecification,
  Map as MapLibreMap,
  SkySpecification,
} from "maplibre-gl"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"

export type Mode = "light" | "dark"

const ATMOSPHERE: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  0,
  1,
  5,
  1,
  7,
  0,
]

// Base maps are OpenFreeMap: free vector tiles, no API key.
const THEMES: Record<
  Mode,
  { style: string; sky: SkySpecification; accent: string }
> = {
  light: {
    style: "https://tiles.openfreemap.org/styles/positron",
    sky: {
      "sky-color": "#a9d3f5",
      "horizon-color": "#eaf4fc",
      "fog-color": "#ffffff",
      "atmosphere-blend": ATMOSPHERE,
    },
    accent: "#2563eb",
  },
  dark: {
    style: "https://tiles.openfreemap.org/styles/dark",
    sky: {
      "sky-color": "#2a2420",
      "horizon-color": "#4a3526",
      "fog-color": "#1a1817",
      "atmosphere-blend": ATMOSPHERE,
    },
    // The theme's dark --primary, so the focus outline reads as the brand.
    accent: "#fa8938",
  },
}

// Alaska and Hawaii to Newfoundland, the Gulf of Mexico to the Arctic islands.
const US_AND_CANADA: [[number, number], [number, number]] = [
  [-168, 18],
  [-52, 72],
]

const FOCUS = ["USA", "CAN"]
const IS_FOCUS: ExpressionSpecification = [
  "in",
  ["get", "iso"],
  ["literal", FOCUS],
]

/**
 * Country shapes from Natural Earth 1:50m (public domain), trimmed to an
 * `iso` property (ADM0_A3) with coordinates rounded to 2 decimals.
 */
const COUNTRIES_URL = "/geo/countries.geojson"

/**
 * Dims every other country toward the water color and outlines the US and
 * Canada. The shapes are far coarser than the base map, so the whole overlay
 * fades out by zoom 7, where the base map's own borders take over.
 */
function addFocusLayers(map: MapLibreMap, mode: Mode) {
  const { accent } = THEMES[mode]
  const water = map.getPaintProperty("water", "fill-color") ?? "#888888"
  // Under the labels, so place names inside the focus stay crisp.
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id

  map.addSource("countries", { type: "geojson", data: COUNTRIES_URL })
  map.addLayer(
    {
      id: "focus-fill",
      type: "fill",
      source: "countries",
      filter: IS_FOCUS,
      paint: {
        "fill-color": accent,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.08, 6, 0],
      },
    },
    firstSymbol
  )
  // Above the labels, so other countries' place names recede too.
  map.addLayer({
    id: "others-dim",
    type: "fill",
    source: "countries",
    filter: ["!", IS_FOCUS],
    paint: {
      "fill-color": water as string,
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 7, 0],
    },
  })
  map.addLayer({
    id: "focus-outline",
    type: "line",
    source: "countries",
    filter: IS_FOCUS,
    layout: { "line-join": "round" },
    paint: {
      "line-color": accent,
      "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 5, 1.6],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, 7, 0],
    },
  })
}

/**
 * A MapLibre globe framed on the US and Canada. The library touches `window`
 * when it loads, so it is imported inside the effect, never during SSR.
 *
 * `onStyleLoad` adds a page's own layers. It runs on every style load, the
 * first and each theme switch, because setStyle drops added layers.
 */
export function NorthAmericaMap({
  onStyleLoad,
  className,
}: {
  onStyleLoad?: (map: MapLibreMap, mode: Mode) => void
  className?: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<MapLibreMap | null>(null)
  const { resolvedTheme } = useTheme()
  const mode: Mode = resolvedTheme === "dark" ? "dark" : "light"
  // Read by the style.load handler, which outlives any one render.
  const modeRef = React.useRef(mode)
  const onStyleLoadRef = React.useRef(onStyleLoad)
  React.useEffect(() => {
    onStyleLoadRef.current = onStyleLoad
  })

  React.useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | undefined

    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !containerRef.current) return

      maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")
      map = new maplibregl.Map({
        container: containerRef.current,
        style: THEMES[modeRef.current].style,
        bounds: US_AND_CANADA,
        fitBoundsOptions: { padding: 24 },
      })
      mapRef.current = map

      // setStyle replaces projection, sky and added layers, so reapply them
      // on every load.
      map.on("style.load", () => {
        if (!map) return
        map.setProjection({ type: "globe" })
        map.setSky(THEMES[modeRef.current].sky)
        addFocusLayers(map, modeRef.current)
        onStyleLoadRef.current?.(map, modeRef.current)
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }))
      map.addControl(new maplibregl.GlobeControl())
    })

    return () => {
      cancelled = true
      map?.remove()
      mapRef.current = null
    }
  }, [])

  React.useEffect(() => {
    if (modeRef.current === mode) return
    modeRef.current = mode
    mapRef.current?.setStyle(THEMES[mode].style)
  }, [mode])

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border bg-background",
        className
      )}
    />
  )
}
