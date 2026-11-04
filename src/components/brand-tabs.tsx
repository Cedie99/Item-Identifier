"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, LayoutGridIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BrandPicker, type BrandInfo } from "@/components/brand-picker"
import { cn } from "@/lib/utils"

/** Brand tabs, like the tabs along the bottom of the Google Sheet. "" = all brands. */
export function BrandTabs({
  brands,
  value,
  totalCount,
  onSelect,
}: {
  brands: BrandInfo[]
  value: string
  totalCount: number
  onSelect: (sheet: string) => void
}) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = stripRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
  }, [])

  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, brands.length])

  // Bring the chosen tab into view (e.g. after picking it from the list or opening a link).
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [value])

  const scrollBy = (dir: 1 | -1) => {
    const el = stripRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }

  // Arrow keys move between tabs, as in any tab list.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const order = ["", ...brands.map((b) => b.sheet)]
    const i = order.indexOf(value)
    const next = order[Math.min(order.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))]
    e.preventDefault()
    onSelect(next)
    requestAnimationFrame(() => stripRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }

  const tab = (sheet: string, label: React.ReactNode, count: number, extra?: string) => {
    const on = value === sheet
    return (
      <button
        key={sheet || "__all"}
        type="button"
        role="tab"
        aria-selected={on}
        tabIndex={on ? 0 : -1}
        onClick={() => onSelect(sheet)}
        className={cn(
          "relative flex shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          on
            ? "z-10 -mb-px border-border bg-background font-semibold text-foreground after:absolute after:inset-x-0 after:top-0 after:h-0.5 after:rounded-t-lg after:bg-brand"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
          count === 0 && !on && "opacity-50",
          extra,
        )}
      >
        {label}
        <span className={cn("rounded-full px-1.5 text-[11px] leading-4 tabular-nums", on ? "bg-brand text-background" : "bg-muted")}>
          {count.toLocaleString()}
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-end gap-1 border-b">
      <div role="tablist" aria-label="Brands" onKeyDown={onKeyDown} className="flex min-w-0 flex-1 items-end">
        {tab("", <><LayoutGridIcon className="size-3.5" /> All brands</>, totalCount, "mr-1")}
        <div className="relative flex min-w-0 flex-1 items-end">
          {edges.left && (
            <Button variant="ghost" size="icon-sm" aria-label="Scroll brands left" onClick={() => scrollBy(-1)} className="absolute left-0 z-20 mb-1 bg-background shadow-sm">
              <ChevronLeftIcon />
            </Button>
          )}
          <div
            ref={stripRef}
            onScroll={measure}
            className={cn(
              "flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              edges.left && "mask-l-from-90%",
              edges.right && "mask-r-from-90%",
            )}
          >
            {brands.map((b) => tab(b.sheet, b.name, b.count))}
          </div>
          {edges.right && (
            <Button variant="ghost" size="icon-sm" aria-label="Scroll brands right" onClick={() => scrollBy(1)} className="absolute right-0 z-20 mb-1 bg-background shadow-sm">
              <ChevronRightIcon />
            </Button>
          )}
        </div>
      </div>
      <BrandPicker
        brands={brands}
        value={value}
        onSelect={onSelect}
        trigger={
          <Button variant="outline" size="sm" className="mb-1.5 shrink-0">
            {brands.length} brands <ChevronDownIcon />
          </Button>
        }
      />
    </div>
  )
}
