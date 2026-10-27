import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

/**
 * Builds lib/geo/postal-centroids.json from the GeoNames postal code dumps
 * (https://download.geonames.org/export/zip/, CC BY 4.0: credit GeoNames
 * wherever the data is shown). Run it only to refresh the committed file;
 * the app never downloads anything.
 *
 *   npm run geo:postal -- --us US.txt --ca CA_full.txt
 *
 * US codes are kept whole (about 41k). Canada's full codes number 900k, so
 * they are averaged down to the forward sortation area, the first three
 * characters (about 1,650): a few km in a city, more in the country, which
 * is close enough to draw a lane.
 */

const { values } = parseArgs({
  options: {
    us: { type: "string" },
    ca: { type: "string" },
    out: {
      type: "string",
      default: path.join(process.cwd(), "lib/geo/postal-centroids.json"),
    },
  },
})
if (!values.us || !values.ca) {
  console.error("Usage: npm run geo:postal -- --us US.txt --ca CA_full.txt")
  process.exit(2)
}

type Point = [lat: number, lng: number]

// GeoNames columns: country, postal code, place, admin1 name, admin1 code,
// admin2 name, admin2 code, admin3 name, admin3 code, lat, lng, accuracy.
function* rows(file: string) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const cols = line.split("\t")
    const lat = Number(cols[9])
    const lng = Number(cols[10])
    if (!cols[1] || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    yield { code: cols[1].trim().toUpperCase(), lat, lng }
  }
}

// About 100 m, far finer than a centroid is accurate.
const round = (n: number) => Math.round(n * 1000) / 1000

const us: Record<string, Point> = {}
for (const r of rows(values.us)) us[r.code] = [round(r.lat), round(r.lng)]

const sums = new Map<string, { lat: number; lng: number; n: number }>()
for (const r of rows(values.ca)) {
  const fsa = r.code.slice(0, 3)
  const s = sums.get(fsa) ?? { lat: 0, lng: 0, n: 0 }
  s.lat += r.lat
  s.lng += r.lng
  s.n += 1
  sums.set(fsa, s)
}
const ca: Record<string, Point> = {}
for (const [fsa, s] of [...sums].sort(([a], [b]) => a.localeCompare(b))) {
  ca[fsa] = [round(s.lat / s.n), round(s.lng / s.n)]
}

writeFileSync(values.out, JSON.stringify({ US: us, CA: ca }) + "\n")
console.log(
  `${Object.keys(us).length} US ZIP codes, ${Object.keys(ca).length} Canadian FSAs → ${values.out}`
)
