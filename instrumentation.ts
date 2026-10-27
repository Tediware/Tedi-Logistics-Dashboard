/**
 * Runs once when the server boots. Prints a Tediware configuration summary,
 * then starts the background sync when an API key is set. The app
 * deliberately does not fail on missing config.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { describeConfig } = await import("./lib/tediware/env")
  const { live, lines } = describeConfig()

  console.log("[tediware] configuration:")
  for (const line of lines) console.log(`  - ${line}`)
  if (!live) {
    console.log("  see .env.example to connect to Tediware")
    return
  }

  const { startBackgroundSync } = await import("./lib/sync")
  startBackgroundSync()
}
