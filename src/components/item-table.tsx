"use client"

import { useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CopyButton } from "@/components/copy-button"
import { Highlight } from "@/components/highlight"
import type { FacetKey, Item } from "@/lib/items"
import { cn } from "@/lib/utils"

function Unit({ um }: { um: string }) {
  if (!um) return null
  return (
    <Badge variant="outline" className="font-heading text-[11px] font-semibold tracking-wide">
      {um}
    </Badge>
  )
}

/** Small link-like tag that narrows the list to items sharing this value. */
function Tag({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={`Show only ${label}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="rounded-sm text-muted-foreground underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {label}
    </button>
  )
}

export function ItemTable({
  items,
  words,
  activeId,
  onOpen,
  onFilter,
  hideBrand = false,
}: {
  items: Item[]
  words: string[]
  activeId: number | null
  onOpen: (id: number) => void
  onFilter: (key: FacetKey, v: string) => void
  /** Hide the brand column (when one brand tab is open). */
  hideBrand?: boolean
}) {
  const activeRef = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [activeId])

  return (
    <Table className="table-fixed">
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className="hidden w-40 md:table-cell">Item no.</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="hidden w-32 lg:table-cell">Barcode</TableHead>
          <TableHead className="hidden w-24 md:table-cell">Stock U/M</TableHead>
          {!hideBrand && <TableHead className="hidden w-36 md:table-cell">Brand</TableHead>}
          <TableHead className="w-10"><span className="sr-only">Copy</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((o) => {
          const active = activeId === o.id
          const tags: [FacetKey, string][] = [["kind", o.kind], ["grade", o.grade], ["pack", o.pack]]
          return (
            <TableRow
              key={o.id}
              ref={active ? activeRef : undefined}
              tabIndex={0}
              aria-selected={active}
              data-state={active ? "selected" : undefined}
              className={cn(
                "cursor-pointer align-top",
                active && "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)] hover:bg-brand-soft",
              )}
              onClick={() => onOpen(o.id)}
              onKeyDown={(e) => e.key === "Enter" && onOpen(o.id)}
            >
              <TableCell className="hidden font-mono text-[13px] break-all whitespace-normal tabular-nums md:table-cell">
                {o.ItemNumber ? <Highlight text={o.ItemNumber} words={words} /> : <Badge className="bg-warn-soft text-warn">no number</Badge>}
                {hideBrand && (
                  <div className="font-sans text-xs text-muted-foreground">{o.added ? "not in sheet yet" : `row ${o.row}`}</div>
                )}
              </TableCell>
              <TableCell className="min-w-0 whitespace-normal">
                <div className="font-mono text-[13px] text-brand md:hidden">
                  {o.ItemNumber ? <Highlight text={o.ItemNumber} words={words} /> : "no number"}
                </div>
                <div className="font-medium">
                  <Highlight text={o.ItemDescription || o.ShortDescription} words={words} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                  {tags.filter(([, v]) => v).map(([k, v], i) => (
                    <span key={k} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-muted-foreground/50">·</span>}
                      <Tag label={v} onClick={() => onFilter(k, v)} />
                    </span>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:hidden">
                  <Unit um={o.StockUmId} />
                  {!hideBrand && <span>{o.brand}</span>}
                  {o.BarcodeNumber && <span className="font-mono">{o.BarcodeNumber}</span>}
                </div>
                {(o.flags.length > 0 || o.added) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {o.added && <Badge className="h-4.5 bg-brand px-1.5 text-[11px] text-background">Added in app</Badge>}
                    {o.flags.map((f) => (
                      <Badge key={f} className="h-4.5 bg-warn-soft px-1.5 text-[11px] text-warn">{f}</Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="hidden font-mono text-[13px] tabular-nums lg:table-cell">
                <Highlight text={o.BarcodeNumber} words={words} />
              </TableCell>
              <TableCell className="hidden md:table-cell"><Unit um={o.StockUmId} /></TableCell>
              {!hideBrand && (
                <TableCell className="hidden whitespace-normal md:table-cell">
                  <Tag label={o.brand} onClick={() => onFilter("brand", o.sheet)} />
                  <div className="text-xs text-muted-foreground">{o.added ? "not in sheet yet" : `row ${o.row}`}</div>
                </TableCell>
              )}
              <TableCell className="px-1">
                {o.ItemNumber && <CopyButton value={o.ItemNumber} label={`item number ${o.ItemNumber}`} />}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
