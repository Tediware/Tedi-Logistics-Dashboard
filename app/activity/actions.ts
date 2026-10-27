"use server"

import type { ActionResult } from "@/components/action-button"
import { isSyncRunning, runSync } from "@/lib/sync"
import { isApiConfigured } from "@/lib/tediware"

// A first sync can take minutes; answer the button well before that and let
// the page show the rest as it lands.
const WAIT_MS = 10_000

export async function syncNow(): Promise<ActionResult> {
  if (!isApiConfigured()) {
    return {
      status: "error",
      message: "Set TEDIWARE_API_KEY in .env.local and restart the app.",
    }
  }
  if (isSyncRunning()) {
    return { status: "success", message: "A sync is already running." }
  }
  const result = await Promise.race([
    runSync(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), WAIT_MS)),
  ])
  if (!result) {
    return {
      status: "success",
      message: "Still syncing. This page updates as documents arrive.",
    }
  }
  if (result.error) return { status: "error", message: result.error }
  return {
    status: "success",
    message:
      result.entries === 0
        ? "Up to date. Nothing new in the feed."
        : `Synced ${result.entries} documents: ${result.processed} processed, ${result.skipped} skipped, ${result.failed} failed.`,
  }
}
