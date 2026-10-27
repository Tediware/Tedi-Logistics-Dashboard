import type { LngLat } from "./postal"

/**
 * Lanes are drawn as gentle arcs rather than straight lines, so a lane and
 * its return trip, or two lanes sharing a corridor, stay apart. The arc
 * always bows to the left of travel, which is what separates the directions.
 * Trucks are placed with the same function, so they sit on the line.
 */

const BOW = 0.18

export function arcPoint(from: LngLat, to: LngLat, t: number): LngLat {
  const [x0, y0] = from
  const [x2, y2] = to
  const dx = x2 - x0
  const dy = y2 - y0
  // The control point: the chord's midpoint pushed left of travel.
  const x1 = (x0 + x2) / 2 - dy * BOW
  const y1 = (y0 + y2) / 2 + dx * BOW
  const u = 1 - t
  return [
    u * u * x0 + 2 * u * t * x1 + t * t * x2,
    u * u * y0 + 2 * u * t * y1 + t * t * y2,
  ]
}

export function arc(from: LngLat, to: LngLat, segments = 48): LngLat[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    arcPoint(from, to, i / segments)
  )
}
