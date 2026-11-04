"use client"

import { useState } from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { BrandInfo } from "@/components/brand-picker"

/** Overview of every brand as cards; picking one opens its tab. */
export function BrandGrid({
  brands,
  kinds,
  onSelect,
}: {
  brands: BrandInfo[]
  /** Top product types per brand sheet. */
  kinds: Map<string, string[]>
  onSelect: (sheet: string) => void
}) {
  const [find, setFind] = useState("")
  const f = find.trim().toLowerCase()
  const list = f ? brands.filter((b) => b.name.toLowerCase().includes(f)) : brands

  return (
    <section aria-label="Brands" className="grid gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">
          Pick a brand <span className="font-normal text-muted-foreground">or search above to look across all of them</span>
        </h2>
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && list[0] && onSelect(list[0].sheet)}
            placeholder="Find a brand…"
            aria-label="Find a brand"
            className="h-8 pl-8"
          />
        </div>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
        {list.map((b) => (
          <li key={b.sheet}>
            <button
              type="button"
              onClick={() => onSelect(b.sheet)}
              className="group grid h-full w-full content-start gap-1 rounded-lg border bg-card p-3 text-left outline-none transition-colors hover:border-brand hover:bg-brand-soft/50 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-heading font-semibold group-hover:text-brand" title={b.name}>{b.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{b.total.toLocaleString()}</span>
              </span>
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {(kinds.get(b.sheet) ?? []).join(" · ") || "No product types yet"}
              </span>
              {b.added > 0 && <span className="text-[11px] font-medium text-brand">{b.added} added in app</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-full py-6 text-center text-sm text-muted-foreground">No brand called “{find}”</li>}
      </ul>
    </section>
  )
}
