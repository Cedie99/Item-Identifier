"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export async function copyToClipboard(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
    return true
  } catch {
    toast.error("Your browser blocked copying. Select the text and press Ctrl+C.")
    return false
  }
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="text-muted-foreground hover:text-foreground"
      onClick={async (e) => {
        e.stopPropagation()
        if (await copyToClipboard(value, `Copied ${value.length > 40 ? value.slice(0, 40) + "…" : value}`)) {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        }
      }}
    >
      {done ? <CheckIcon className="text-emerald-600 dark:text-emerald-400" /> : <CopyIcon />}
    </Button>
  )
}
