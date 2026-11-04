"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { ClipboardCopyIcon, FileUpIcon, PlusIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { AddItemSheet } from "@/components/add-item-sheet"
import { BrandGrid } from "@/components/brand-grid"
import type { BrandInfo } from "@/components/brand-picker"
import { BrandTabs } from "@/components/brand-tabs"
import { copyToClipboard } from "@/components/copy-button"
import { ItemSheet } from "@/components/item-sheet"
import { ItemTable } from "@/components/item-table"
import { Pager } from "@/components/pager"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  activeFilterCount, brandName, buildVocabulary, compareBrand, EMPTY_FILTERS, FACETS, facetLabel, filtersFromUrl, filtersToUrl,
  search, suggestWord, tokenize, toItems, toTsv, type AddedItem, type FacetKey, type Filters, type Item, type SortKey,
} from "@/lib/items"
import type { Dataset } from "@/lib/parse-workbook"

const PAGE = 50
const STORE_KEY = "item-master-finder:uploaded"

function readSaved(): Dataset | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null")
    return d?.rows ? d : null
  } catch {
    return null
  }
}

/** A file the viewer loaded earlier if there is one, otherwise the copy shipped with the app. */
async function fetchDataset(preferSaved: boolean): Promise<Dataset> {
  const saved = preferSaved ? readSaved() : null
  if (saved) return saved
  const res = await fetch("/data/items.json")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const SORTS: { value: SortKey; label: string }[] = [
  { value: "brand", label: "Brand A–Z" },
  { value: "best", label: "Best match" },
  { value: "num", label: "Item number" },
  { value: "desc", label: "Description A–Z" },
]

async function fetchAdded(): Promise<AddedItem[]> {
  const res = await fetch("/api/items", { cache: "no-store" })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function ItemFinder() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  /** Current results page, 0-based. */
  const [pageIndex, setPageIndex] = useState(0)
  const [openId, setOpenId] = useState<number | null>(null)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  /** A query the user asked to search exactly as typed, without spelling correction. */
  const [literalQ, setLiteralQ] = useState<string | null>(null)
  const [added, setAdded] = useState<AddedItem[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [addTemplate, setAddTemplate] = useState<Item | null>(null)
  const [editItem, setEditItem] = useState<Item | null>(null)
  const pendingItem = useRef<string | null>(null)
  /** Open this added item as soon as it shows up in the list. */
  const pendingUid = useRef<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback((preferSaved: boolean) => {
    fetchDataset(preferSaved).then(setData, (e: Error) =>
      setError(`Could not load the item list (${e.message}). Run "npm run import-data" and reload.`),
    )
  }, [])

  // First load: data and filters from the URL.
  useEffect(() => {
    let live = true
    const url = window.location.search
    /* eslint-disable react-hooks/set-state-in-effect -- reading browser-only state once on mount */
    setFilters(filtersFromUrl(url))
    setReady(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    pendingItem.current = new URLSearchParams(url).get("item")
    fetchDataset(true).then(
      (d) => live && setData(d),
      (e: Error) => live && setError(`Could not load the item list (${e.message}). Run "npm run import-data" and reload.`),
    )
    fetchAdded().then(
      (a) => live && setAdded(a),
      () => live && toast.warning("Could not load items added in the app."),
    )
    return () => {
      live = false
    }
  }, [])

  const items = useMemo(() => (data ? toItems(data, added) : []), [data, added])
  const vocab = useMemo(() => buildVocabulary(items), [items])
  const deferred = useDeferredValue(filters)
  const exactResult = useMemo(() => search(items, deferred), [items, deferred])
  // Misspelled words ("hydrolic") are corrected automatically when the fix finds items.
  const corrected = useMemo(() => {
    if (!exactResult.missing.length || deferred.q === literalQ) return null
    const fixes = new Map(exactResult.missing.map((w) => [w, suggestWord(w, vocab)]))
    if ([...fixes.values()].some((v) => !v)) return null
    const q = deferred.q.split(/(\s+)/).map((w) => fixes.get(w.toLowerCase()) ?? w).join("")
    const r = search(items, { ...deferred, q })
    return r.items.length && !r.partial ? { q, result: r } : null
  }, [exactResult, deferred, literalQ, vocab, items])
  const result = corrected?.result ?? exactResult
  const results = result.items
  const words = useMemo(() => tokenize(corrected?.q ?? deferred.q), [corrected, deferred.q])
  const nActive = activeFilterCount(filters)
  const hasQuery = filters.q.trim() !== ""
  const brandSheet = filters.brand.length === 1 ? filters.brand[0] : ""
  /** Filters other than the brand tab. */
  const narrowing = hasQuery || nActive - filters.brand.length > 0

  // One entry per brand tab: totals never change, counts follow the search and filters.
  const brandBase = useMemo(() => {
    const m = new Map<string, { total: number; added: number; kinds: Map<string, number> }>()
    for (const o of items) {
      const b = m.get(o.sheet) ?? { total: 0, added: 0, kinds: new Map() }
      b.total++
      if (o.added) b.added++
      if (o.kind) b.kinds.set(o.kind, (b.kinds.get(o.kind) ?? 0) + 1)
      m.set(o.sheet, b)
    }
    const list = [...m].map(([sheet, b]) => ({ sheet, name: brandName(sheet), total: b.total, added: b.added }))
    list.sort((a, b) => compareBrand(a.name, b.name))
    const kinds = new Map([...m].map(([sheet, b]) => [sheet, [...b.kinds].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k)]))
    return { list, kinds }
  }, [items])
  const brands: BrandInfo[] = brandBase.list.map((b) => ({ ...b, count: result.facetCounts.brand.get(b.sheet) ?? 0 }))
  // While searching, only show tabs that have matches.
  const tabBrands = narrowing ? brands.filter((b) => b.count > 0 || b.sheet === brandSheet) : brands
  const allBrandsCount = brands.reduce((n, b) => n + b.count, 0)
  const currentBrand = brands.find((b) => b.sheet === brandSheet)
  const suggestions = useMemo(
    () => result.missing.map((w) => [w, suggestWord(w, vocab)] as const).filter((x): x is [string, string] => !!x[1]),
    [result.missing, vocab],
  )

  const openItem = items.find((o) => o.id === openId) ?? null
  const dupes = openItem?.ItemNumber ? items.filter((o) => o.ItemNumber === openItem.ItemNumber && o.id !== openItem.id) : []
  const openIndex = openId == null ? -1 : results.findIndex((o) => o.id === openId)
  // Clamp, so a page past the end (results shrank, e.g. an item was removed) shows the last page instead.
  const page = Math.min(pageIndex, Math.max(0, Math.ceil(results.length / PAGE) - 1))
  const visible = results.slice(page * PAGE, (page + 1) * PAGE)
  const highlighted = activeId != null && visible.some((o) => o.id === activeId) ? activeId : hasQuery ? (visible[0]?.id ?? null) : null

  // Open an item linked from the URL once the data is in.
  useEffect(() => {
    const n = pendingItem.current
    if (!n || !items.length) return
    pendingItem.current = null
    const o = items.find((x) => x.ItemNumber === n)
    if (o) setOpenId(o.id)
  }, [items])

  useEffect(() => {
    const uid = pendingUid.current
    if (!uid) return
    const o = items.find((x) => x.added?.uid === uid)
    if (!o) return
    pendingUid.current = null
    setOpenId(o.id)
    setActiveId(o.id)
  }, [items])

  // Keep the address bar in sync so searches and items can be bookmarked or shared.
  useEffect(() => {
    if (!ready) return
    const qs = filtersToUrl(filters, openItem?.ItemNumber)
    if (qs !== window.location.search) window.history.replaceState(null, "", window.location.pathname + qs)
  }, [filters, openItem, ready])

  // Sticky sidebar sits right under the header, whatever height the header wraps to.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--hdr", `${el.offsetHeight}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const goToPage = (p: number) => {
    setPageIndex(p)
    setActiveId(null)
    resultsRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPageIndex(0)
    setActiveId(null)
  }
  const toggleFacet = (key: FacetKey, v: string) => {
    setFilters((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }))
    setPageIndex(0)
    setActiveId(null)
  }
  const onlyFacet = (key: FacetKey, v: string) => {
    update({ [key]: [v] } as Partial<Filters>)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const clearAll = () => {
    setFilters(EMPTY_FILTERS)
    setPageIndex(0)
    setActiveId(null)
    searchRef.current?.focus()
  }

  const open = (id: number) => {
    setOpenId(id)
    setActiveId(id)
  }

  const step = (delta: 1 | -1) => {
    const i = openIndex + delta
    if (i < 0 || i >= results.length) return
    // Prev/next in the item panel follows the results across pages.
    setPageIndex(Math.floor(i / PAGE))
    open(results[i].id)
  }

  const moveActive = (delta: number) => {
    if (!visible.length) return
    const i = highlighted == null ? -1 : visible.findIndex((o) => o.id === highlighted)
    const next = Math.min(visible.length - 1, Math.max(0, i + delta))
    setActiveId(visible[next].id)
  }

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase()
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function onFile(file: File) {
    const id = toast.loading(`Reading ${file.name}…`)
    try {
      const [XLSX, { parseWorkbook }] = await Promise.all([import("xlsx"), import("@/lib/parse-workbook")])
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" })
      const d = parseWorkbook(XLSX, wb, {
        file: file.name,
        asOf: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
        uploaded: true,
      })
      if (!d.rows.length) {
        toast.error("No items found. Is this the item master file?", { id })
        return
      }
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(d))
      } catch {
        /* too big or blocked; still use it for this session */
      }
      setData(d)
      setOpenId(null)
      update({})
      toast.success(`Loaded ${d.rows.length.toLocaleString()} items from ${file.name}`, { id })
    } catch (e) {
      toast.error(`Could not read that file: ${(e as Error).message}`, { id })
    }
  }

  function startAdd(template: Item | null, edit: Item | null = null) {
    setAddTemplate(edit ? null : template)
    setEditItem(edit)
    setOpenId(null)
    setAddOpen(true)
  }

  function onSaved(a: AddedItem, edited: boolean) {
    setAddOpen(false)
    pendingUid.current = a.uid
    setAdded((list) => (edited ? list.map((x) => (x.uid === a.uid ? a : x)) : [...list, a]))
    // Show the new item in its brand tab (a new brand gets its own tab).
    update({ ...EMPTY_FILTERS, brand: [a.sheet] })
  }

  async function removeAdded(o: Item) {
    if (!o.added || !window.confirm(`Remove ${o.ItemNumber || "item"} (${o.ItemDescription}) from the app?

This only removes the copy added here.`)) return
    try {
      const res = await fetch(`/api/items?uid=${encodeURIComponent(o.added.uid)}`, { method: "DELETE" })
      if (!res.ok && res.status !== 404) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`)
      setOpenId(null)
      setAdded((list) => list.filter((a) => a.uid !== o.added!.uid))
      toast.success(`Removed ${o.ItemNumber || o.ItemDescription}`)
    } catch (e) {
      toast.error(`Could not remove: ${(e as Error).message}`)
    }
  }

  function resetToBuiltIn() {
    try {
      localStorage.removeItem(STORE_KEY)
    } catch {}
    setData(null)
    setOpenId(null)
    loadData(false)
    toast.success("Back to the built-in copy")
  }

  const replaceWord = (from: string, to: string) =>
    update({ q: filters.q.split(/(\s+)/).map((w) => (w.toLowerCase() === from ? to : w)).join("") })
  const dropWord = (w: string) => update({ q: filters.q.split(/\s+/).filter((x) => x && x.toLowerCase() !== w).join(" ") })

  const selectBrand = (sheet: string) => {
    update({ brand: sheet ? [sheet] : [] })
    setOpenId(null)
  }

  const chips: { key: string; label: string; remove: () => void }[] = [
    ...FACETS.filter(({ key }) => key !== "brand").flatMap(({ key, label }) =>
      filters[key].map((v) => ({ key: `${key}:${v}`, label: `${label}: ${facetLabel(key, v)}`, remove: () => toggleFacet(key, v) })),
    ),
    ...(filters.issuesOnly ? [{ key: "issues", label: "Needs attention", remove: () => update({ issuesOnly: false }) }] : []),
    ...(filters.addedOnly ? [{ key: "added", label: "Added in app", remove: () => update({ addedOnly: false }) }] : []),
  ]

  const idle = !narrowing && !brandSheet

  return (
    <div className="flex min-h-full flex-col">
      <header ref={headerRef} className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto grid w-full max-w-[90rem] gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <button type="button" onClick={clearAll} className="font-heading text-2xl font-bold tracking-tight" title="Start over">
              Item Master <span className="text-brand">Finder</span>
            </button>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {data && (
                <>
                  <span className="hidden sm:inline">
                    Source: <span className="font-medium text-foreground">{data.source.file}</span>
                  </span>
                  <span>{data.source.uploaded ? `loaded ${data.source.asOf}` : `as of ${data.source.asOf}`}</span>
                  {data.source.uploaded && (
                    <Button variant="link" size="xs" className="h-auto p-0" onClick={resetToBuiltIn}>
                      Use built-in copy
                    </Button>
                  )}
                </>
              )}
              <Button variant="ghost" size="xs" onClick={() => fileRef.current?.click()} title="Load a newer download of the tracker">
                <FileUpIcon /> Load newer file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ""
                  if (f) onFile(f)
                }}
              />
              <ThemeToggle />
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                type="search"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                aria-label="Search items"
                aria-describedby="search-help"
                placeholder="Search anything: item no., barcode, name, “hydraulic 68 drum”, “15w40 pail”…"
                value={filters.q}
                onChange={(e) => update({ q: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); moveActive(1) }
                  else if (e.key === "ArrowUp") { e.preventDefault(); moveActive(-1) }
                  else if (e.key === "Enter") {
                    const id = highlighted ?? visible[0]?.id
                    if (id != null) open(id)
                  } else if (e.key === "Escape" && filters.q) { e.preventDefault(); update({ q: "" }) }
                }}
                className="h-11 pr-10 pl-10 text-base md:text-base [&::-webkit-search-cancel-button]:appearance-none"
              />
              {filters.q ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => { update({ q: "" }); searchRef.current?.focus() }}
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-xs text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </div>
            <Button className="h-11" onClick={() => startAdd(null)} disabled={!data} title="Add a new item">
              <PlusIcon />
              <span className="hidden sm:inline">Add item</span>
            </Button>
          </div>
          <p id="search-help" className="sr-only">
            Use the up and down arrow keys to move through results and Enter to open one.
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[90rem] flex-1 px-4 sm:px-6">
        <main className="min-w-0 pb-10">
          {data && (
            <div className="sticky top-(--hdr) z-10 -mx-1 bg-background px-1 pt-3">
              <BrandTabs brands={tabBrands} value={brandSheet} totalCount={allBrandsCount} onSelect={selectBrand} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div aria-live="polite">
              {!data ? (
                <p className="font-heading text-base font-semibold">Loading items…</p>
              ) : currentBrand ? (
                <>
                  <h2 className="font-heading text-xl leading-tight font-bold">{currentBrand.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {narrowing
                      ? `${results.length.toLocaleString()} of ${currentBrand.total.toLocaleString()} items match`
                      : `${currentBrand.total.toLocaleString()} item${currentBrand.total === 1 ? "" : "s"}`}
                    {result.partial && " (closest matches)"}
                    {currentBrand.sheet !== currentBrand.name && <span className="ml-2 text-xs">Tab: {currentBrand.sheet}</span>}
                  </p>
                </>
              ) : (
                <p className="font-heading text-base font-semibold">
                  {idle ? `${brands.length} brands` : `${results.length.toLocaleString()} item${results.length === 1 ? "" : "s"}`}
                  {result.partial && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">closest matches</span>}
                  <span className="ml-2 font-sans text-sm font-normal text-muted-foreground">
                    {idle ? `${items.length.toLocaleString()} items in total` : `across ${brands.filter((b) => b.count).length} brands`}
                  </span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentBrand && (
                <Button variant="outline" size="sm" onClick={() => startAdd(null)}>
                  <PlusIcon /> Add to {currentBrand.name}
                </Button>
              )}
              <Select
                items={SORTS}
                value={filters.sort}
                onValueChange={(v) => update({ sort: (v || "brand") as SortKey })}
              >
                <SelectTrigger size="sm" aria-label="Sort by" className="w-40">
                  <span className="text-muted-foreground">Sort:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {SORTS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={!results.length} onClick={() => copyToClipboard(toTsv(results), `Copied ${results.length} rows. Paste into Excel.`)}>
                <ClipboardCopyIcon /> Copy for Excel
              </Button>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.remove}
                  aria-label={`Remove filter ${c.label}`}
                  className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand-soft py-0.5 pr-1.5 pl-2.5 text-xs font-medium hover:border-brand"
                >
                  {c.label}
                  <XIcon className="size-3.5 opacity-70" />
                </button>
              ))}
              <Button variant="ghost" size="xs" onClick={clearAll}>
                Clear all
              </Button>
            </div>
          )}

          {data && corrected && (
            <div className="mb-3 flex flex-wrap items-center gap-x-1.5 rounded-lg border border-brand/30 bg-brand-soft/60 px-3 py-2 text-sm">
              <SparklesIcon className="size-4 text-brand" />
              Showing results for <span className="font-semibold">{corrected.q}</span>.
              <button type="button" className="text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setLiteralQ(deferred.q)}>
                Search for “{deferred.q}” instead
              </button>
            </div>
          )}

          {data && !corrected && (suggestions.length > 0 || result.partial || (result.missing.length > 0 && !results.length)) && (
            <div className="mb-3 rounded-lg border border-brand/30 bg-brand-soft/60 px-3 py-2 text-sm">
              {suggestions.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <SparklesIcon className="size-4 text-brand" />
                  Did you mean
                  {suggestions.map(([from, to], i) => (
                    <span key={from}>
                      {i > 0 && " / "}
                      <button type="button" className="font-semibold text-brand underline underline-offset-2" onClick={() => replaceWord(from, to)}>
                        {to}
                      </button>
                      <span className="text-muted-foreground"> (for “{from}”)</span>
                    </span>
                  ))}
                  ?
                </p>
              )}
              {result.missing.length > 0 && (
                <p className="text-muted-foreground">
                  Nothing{nActive ? " in the current filters" : ""} contains{" "}
                  {result.missing.map((w, i) => (
                    <span key={w}>
                      {i > 0 && ", "}“<span className="text-foreground">{w}</span>”{" "}
                      <button type="button" className="text-xs text-brand hover:underline" onClick={() => dropWord(w)}>remove</button>
                    </span>
                  ))}
                  {result.partial && ". Showing items that match the other words."}
                </p>
              )}
              {result.partial && result.missing.length === 0 && (
                <p className="text-muted-foreground">No single item matches every word, so these match the most words.</p>
              )}
            </div>
          )}

          <Card ref={resultsRef} className="scroll-mt-[calc(var(--hdr,0px)+0.75rem)] gap-0 overflow-hidden py-0">
            {data && idle ? (
              <BrandGrid brands={brands} kinds={brandBase.kinds} onSelect={selectBrand} />
            ) : error ? (
              <div className="p-10 text-center text-sm text-warn">{error}</div>
            ) : !data ? (
              <div className="grid gap-3 p-4">
                {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : results.length === 0 ? (
              <div className="grid justify-items-center gap-3 p-12 text-center">
                <div>
                  <p className="font-medium">No items match{currentBrand ? ` in ${currentBrand.name}` : ""}</p>
                  <p className="text-sm text-muted-foreground">
                    {chips.length ? "Try removing a filter:" : "Try fewer or shorter words, e.g. just the item number or “68 d200”."}
                  </p>
                </div>
                {currentBrand && allBrandsCount > 0 && (
                  <Button onClick={() => selectBrand("")}>
                    See {allBrandsCount.toLocaleString()} match{allBrandsCount === 1 ? "" : "es"} in other brands
                  </Button>
                )}
                {chips.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {chips.map((c) => (
                      <Button key={c.key} variant="outline" size="xs" onClick={c.remove}>
                        <XIcon /> {c.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <ItemTable
                  items={visible}
                  words={words}
                  activeId={highlighted}
                  onOpen={open}
                  onFilter={onlyFacet}
                  hideBrand={!!currentBrand}
                />
                <Pager page={page} pageSize={PAGE} total={results.length} onPage={goToPage} />
              </>
            )}
          </Card>
          <p className="pt-4 text-xs text-muted-foreground">
            Tip: press <kbd className="rounded border px-1 font-mono">/</kbd> to search,{" "}
            <kbd className="rounded border px-1 font-mono">↑</kbd> <kbd className="rounded border px-1 font-mono">↓</kbd> to move,{" "}
            <kbd className="rounded border px-1 font-mono">Enter</kbd> to open. Read-only: nothing here changes the tracker file.
          </p>
        </main>
      </div>

      <ItemSheet
        item={openItem}
        others={dupes}
        position={{ index: openIndex, total: results.length }}
        onOpenChange={(o) => !o && setOpenId(null)}
        onOpenItem={open}
        onStep={step}
        onBrowse={(f) => {
          setOpenId(null)
          update({ ...EMPTY_FILTERS, ...f, q: "" })
          window.scrollTo({ top: 0, behavior: "smooth" })
        }}
        onAddSimilar={(o) => startAdd(o)}
        onEdit={(o) => startAdd(null, o)}
        onRemove={removeAdded}
      />

      <AddItemSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        items={items}
        template={addTemplate}
        editing={editItem}
        defaultSheet={brandSheet}
        brands={brandBase.list}
        onSaved={onSaved}
      />
    </div>
  )
}
