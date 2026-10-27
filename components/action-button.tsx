"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export type ActionResult = { status: "success" | "error"; message: string }

/** Runs a server action and reports its result as a toast. */
export function ActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>
  label: string
  pendingLabel: string
}) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const result = await action()
      if (result.status === "success") toast.success(result.message)
      else toast.error(result.message)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
