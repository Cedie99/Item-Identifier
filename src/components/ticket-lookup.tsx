"use client"

import { useState } from "react"
import { TicketIcon } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CLASS_PARTS, type Ticket } from "@/lib/jotform"

/** Paste an ERIC ERP ticket number to fill the item class (and description) from Jotform. */
export function TicketLookup({ onLoaded }: { onLoaded: (t: Ticket) => void }) {
  const [no, setNo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<Ticket | null>(null)

  async function load() {
    if (!no.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/jotform/ticket?no=${encodeURIComponent(no.trim())}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`)
      setTicket(body as Ticket)
      setNo((body as Ticket).ticket)
      onLoaded(body as Ticket)
    } catch (e) {
      setTicket(null)
      setError((e as Error).message === "Failed to fetch" ? "Could not reach the app server. Is it running?" : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="grid gap-2 rounded-lg border bg-muted/40 p-3" aria-label="Fill from Jotform ticket">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <TicketIcon className="size-3.5" /> Fill from ERP ticket
      </span>
      <div className="flex gap-2">
        <Input
          value={no}
          onChange={(e) => setNo(e.target.value)}
          onKeyDown={(e) => {
            // Enter loads the ticket instead of submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault()
              load()
            }
          }}
          placeholder="e.g. ERP-003421"
          aria-label="Ticket number"
          className="font-mono"
        />
        <Button type="button" variant="outline" onClick={load} disabled={loading || !no.trim()}>
          {loading ? "Loading…" : "Load"}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-warn">{error}</p>}
      {ticket && (
        <div className="grid gap-2 text-xs">
          <p className="text-muted-foreground">
            {ticket.description || "No description"}
            {ticket.brand && <> · Brand {ticket.brand}</>}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {CLASS_PARTS.map(([k, label]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className={ticket.parts[k] ? "font-medium" : "text-warn"}>{ticket.parts[k] || "Blank on the ticket"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-1 rounded-md bg-background px-2 py-1">
            <code className="min-w-0 flex-1 break-words font-mono">{ticket.itemClass}</code>
            <CopyButton value={ticket.itemClass} label="item class" />
          </div>
          {ticket.missing.length > 0 && (
            <p className="text-warn">Missing on the ticket: {ticket.missing.join(", ")}. Fill it in on Item Class below.</p>
          )}
        </div>
      )}
    </section>
  )
}
