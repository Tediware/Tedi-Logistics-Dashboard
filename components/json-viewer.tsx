"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { prettyJson } from "@/lib/format"

/**
 * Pretty-printed JSON with a copy button. This is the "here is exactly what
 * crossed the wire" surface, so it shows the payload verbatim.
 */
export function JsonViewer({ value }: { value: unknown }) {
  const text = prettyJson(value)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be unavailable (insecure context); ignore.
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-2 right-2"
        onClick={copy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 pt-12 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  )
}
