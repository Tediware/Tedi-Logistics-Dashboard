import centroids from "./postal-centroids.json"

/**
 * Places a postal code on the map from the committed GeoNames centroids
 * (scripts/build-postal-centroids.ts). No geocoding service: a stop lands at
 * the middle of its ZIP code or Canadian forward sortation area.
 */

/** [lng, lat], the order GeoJSON and MapLibre use. */
export type LngLat = [lng: number, lat: number]

const TABLE = centroids as unknown as Record<
  string,
  Record<string, [number, number]>
>

// 204s name countries in alpha-3, 214s in alpha-2.
const COUNTRY: Record<string, string> = {
  US: "US",
  USA: "US",
  CA: "CA",
  CAN: "CA",
}

/** The table's key for a postal code: a 5-digit ZIP, or a Canadian FSA. */
export function postalKey(
  postalCode: string | null | undefined,
  country: string | null | undefined
): { country: string; code: string } | null {
  const c = COUNTRY[(country ?? "").trim().toUpperCase()]
  const raw = (postalCode ?? "").replace(/\s+/g, "").toUpperCase()
  if (!c || !raw) return null
  const code = c === "US" ? raw.slice(0, 5) : raw.slice(0, 3)
  return { country: c, code }
}

export function postalCentroid(
  postalCode: string | null | undefined,
  country: string | null | undefined
): LngLat | null {
  const key = postalKey(postalCode, country)
  const point = key && TABLE[key.country]?.[key.code]
  return point ? [point[1], point[0]] : null
}

// US ZIP prefixes (first three digits) by state, as ranges, and Canadian
// provinces by the first letter of the postal code. X (the territories) is
// read as the Northwest Territories.
const ZIP3_STATES: [from: number, to: number, state: string][] = [
  [5, 5, "NY"],
  [6, 9, "PR"],
  [10, 27, "MA"],
  [28, 29, "RI"],
  [30, 38, "NH"],
  [39, 49, "ME"],
  [50, 59, "VT"],
  [60, 69, "CT"],
  [70, 89, "NJ"],
  [100, 149, "NY"],
  [150, 196, "PA"],
  [197, 199, "DE"],
  [200, 205, "DC"],
  [206, 219, "MD"],
  [220, 246, "VA"],
  [247, 268, "WV"],
  [270, 289, "NC"],
  [290, 299, "SC"],
  [300, 319, "GA"],
  [320, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"],
  [386, 397, "MS"],
  [398, 399, "GA"],
  [400, 427, "KY"],
  [430, 459, "OH"],
  [460, 479, "IN"],
  [480, 499, "MI"],
  [500, 528, "IA"],
  [530, 549, "WI"],
  [550, 567, "MN"],
  [570, 577, "SD"],
  [580, 588, "ND"],
  [590, 599, "MT"],
  [600, 629, "IL"],
  [630, 658, "MO"],
  [660, 679, "KS"],
  [680, 693, "NE"],
  [700, 714, "LA"],
  [716, 729, "AR"],
  [730, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"],
  [820, 831, "WY"],
  [832, 838, "ID"],
  [840, 847, "UT"],
  [850, 865, "AZ"],
  [870, 884, "NM"],
  [885, 885, "TX"],
  [889, 898, "NV"],
  [900, 961, "CA"],
  [967, 968, "HI"],
  [970, 979, "OR"],
  [980, 994, "WA"],
  [995, 999, "AK"],
]
const FSA_PROVINCES: Record<string, string> = {
  A: "NL",
  B: "NS",
  C: "PE",
  E: "NB",
  G: "QC",
  H: "QC",
  J: "QC",
  K: "ON",
  L: "ON",
  M: "ON",
  N: "ON",
  P: "ON",
  R: "MB",
  S: "SK",
  T: "AB",
  V: "BC",
  X: "NT",
  Y: "YT",
}

/** The state or province a postal code is in, from its leading characters. */
export function stateOfPostal(country: string, code: string): string | null {
  if (country === "CA") return FSA_PROVINCES[code[0]?.toUpperCase()] ?? null
  const zip3 = Number(code.slice(0, 3))
  if (!Number.isInteger(zip3)) return null
  return (
    ZIP3_STATES.find(([from, to]) => zip3 >= from && zip3 <= to)?.[2] ?? null
  )
}

let points:
  { country: string; code: string; lat: number; lng: number }[] | null = null

/**
 * The postal code whose centroid is nearest a position, for a truck that
 * reported only coordinates. A linear scan of the table, built on first use.
 */
export function nearestPostal(
  position: LngLat
): { country: string; code: string } | null {
  points ??= Object.entries(TABLE).flatMap(([country, codes]) =>
    Object.entries(codes).map(([code, [lat, lng]]) => ({
      country,
      code,
      lat,
      lng,
    }))
  )
  const [lng, lat] = position
  // Shrink longitude by latitude so distances compare fairly.
  const scale = Math.cos((lat * Math.PI) / 180) ** 2
  let best: (typeof points)[number] | null = null
  let bestDistance = Infinity
  for (const p of points) {
    const distance = (p.lat - lat) ** 2 + (p.lng - lng) ** 2 * scale
    if (distance < bestDistance) {
      best = p
      bestDistance = distance
    }
  }
  return best && { country: best.country, code: best.code }
}
