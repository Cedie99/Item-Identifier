"use client"

import { useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { CheckIcon, SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface BrandInfo {
  /** Google Sheet tab name (the stored value). */
  sheet: string
  /** Display name, without the "Item Master" prefix. */
  name: string
  /** Items in this brand matching the current search/filters. */
  count: number
  total: number
  added: number
}

/** A button that opens a searchable list of every brand. */
export function BrandPicker({
  brands,
  value,
  onSelect,
  trigger,
  showCounts = true,
  align = "end",
}: {
  brands: BrandInfo[]
  value: string
  onSelect: (sheet: string) => void
  trigger: React.ReactElement
  showCounts?: boolean
  align?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState("")
  const f = find.trim().toLowerCase()
  const list = f ? brands.filter((b) => b.name.toLowerCase().includes(f) || b.sheet.toLowerCase().includes(f)) : brands

  const pick = (sheet: string) => {
    onSelect(sheet)
    setOpen(false)
    setFind("")
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align={align} className="z-50">
          <Popover.Popup className="flex max-h-[min(28rem,var(--available-height))] w-72 origin-(--transform-origin) flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="relative border-b p-2">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && list[0]) {
                    e.preventDefault()
                    pick(list[0].sheet)
                  }
                }}
                placeholder={`Find among ${brands.length} brands…`}
                aria-label="Find a brand"
                className="h-8 pl-7"
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label="Brands">
              {list.map((b) => (
                <li key={b.sheet}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={b.sheet === value}
                    onClick={() => pick(b.sheet)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                      showCounts && b.count === 0 && "text-muted-foreground",
                    )}
                  >
                    <CheckIcon className={cn("size-3.5 shrink-0 text-brand", b.sheet !== value && "invisible")} />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {showCounts && <span className="text-xs text-muted-foreground tabular-nums">{b.count.toLocaleString()}</span>}
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="px-2 py-3 text-center text-sm text-muted-foreground">No brand called “{find}”</li>}
            </ul>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
