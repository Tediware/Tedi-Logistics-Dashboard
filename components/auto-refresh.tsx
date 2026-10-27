"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Re-renders the page's server components every few seconds while the tab is
 * visible, so a list keeps up with a running sync.
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh()
    }, seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
