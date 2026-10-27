import path from "node:path"
import { parseArgs } from "node:util"

import { rebuild, runSync } from "../lib/sync"

/**
 * Syncs from the command line, as the background sync and the Sync now
 * button do: reads the feed up to now, then exits. Handy for watching the
 * first sync, which reads up to 45 days.
 *
 *   npm run sync              # read the feed up to now
 *   npm run sync:rebuild      # rebuild tenders and loads from what is stored
 *
 * A rebuild reads nothing from Tediware. Use it after changing how
 * documents are read (lib/loads/).
 */

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
} catch {
  // .env.local is optional; the key may come from the ambient environment.
}

const { values } = parseArgs({
  options: { rebuild: { type: "boolean", default: false } },
})

if (values.rebuild) {
  const counts = rebuild()
  console.log(
    `Rebuilt: ${counts.processed} processed, ${counts.skipped} skipped, ${counts.failed} failed.`
  )
} else {
  const result = await runSync()
  console.log(
    `Synced ${result.entries} entries: ${result.processed} processed, ${result.skipped} skipped, ${result.failed} failed.`
  )
  if (result.error) {
    console.error(`Stopped early: ${result.error}`)
    process.exitCode = 1
  }
}
