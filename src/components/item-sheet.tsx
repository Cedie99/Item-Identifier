"use client"

import { ChevronDownIcon, ChevronUpIcon, CopyPlusIcon, LinkIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { CopyButton, copyToClipboard } from "@/components/copy-button"
import { parseBarcode, unitCodeLabel } from "@/lib/barcode"
import { FIELDS, FIELD_LABEL, type FieldKey } from "@/lib/parse-workbook"
import type { FacetKey, Item } from "@/lib/items"

const MAIN_GROUPS: [string, FieldKey[]][] = [
  ["Product", ["ItemNumber", "ItemDescription", "ShortDescription", "BarcodeNumber", "ItemType", "ItemClassId", "ProductGroupId"]],
  ["Units of measure", ["StockUmId", "BillingUmId", "PackUmId"]],
  ["Record", ["RecordOwner", "DateLaunched", "HoldCodeId", "SpecificationTemplateId", "LocationTypeId", "Remarks"]],
]
const used = new Set(MAIN_GROUPS.flatMap(([, k]) => k))
const GROUPS: [string, FieldKey[]][] = [
  ...MAIN_GROUPS,
  ["Inventory settings", FIELDS.map(([k]) => k).filter((k) => !used.has(k))],
]
const COPYABLE = new Set<FieldKey>(["ItemNumber", "ItemDescription", "ShortDescription", "BarcodeNumber", "ItemClassId"])

function Value({ v }: { v: string }) {
  if (!v) return <span className="text-muted-foreground">—</span>
  if (v === "TRUE") return <span className="font-medium text-emerald-700 dark:text-emerald-400">Yes</span>
  if (v === "FALSE") return <span className="text-muted-foreground">No</span>
  return <span className="break-words">{v}</span>
}

/** Barcode with its parts: brand code, item number in the brand, unit code; plus the pack barcode (box, pail, drum). */
function BarcodeValue({ v, packCode, packUnit, pack }: { v: string; packCode: string; packUnit: string; pack: string }) {
  const p = parseBarcode(v)
  if (!p) return <Value v={v} />
  return (
    <span className="grid">
      <span>{v}</span>
      <span className="text-xs text-muted-foreground">
        brand {p.brand} · item {p.seq} · unit {p.unit}{unitCodeLabel(p.unit) ? ` (${unitCodeLabel(p.unit)})` : ""}
      </span>
      {packCode && (
        <span className="mt-1 flex items-center gap-1">
          <span className="grid">
            <span>{packCode}</span>
            <span className="text-xs text-muted-foreground">{packUnit.toLowerCase()} barcode{pack ? ` (${pack})` : ""}</span>
          </span>
          <CopyButton value={packCode} label={`${packUnit.toLowerCase()} barcode`} />
        </span>
      )}
    </span>
  )
}

export function ItemSheet({
  item,
  others,
  position,
  onOpenChange,
  onOpenItem,
  onStep,
  onBrowse,
  onAddSimilar,
  onRemove,
}: {
  item: Item | null
  others: Item[]
  /** Where this item sits in the current results, for prev/next. */
  position: { index: number; total: number }
  onOpenChange: (open: boolean) => void
  onOpenItem: (id: number) => void
  onStep: (delta: 1 | -1) => void
  onBrowse: (filters: Partial<Record<FacetKey, string[]>>) => void
  onAddSimilar: (item: Item) => void
  onRemove: (item: Item) => void
}) {
  const { index, total } = position
  const inList = index >= 0

  const related: { label: string; f: Partial<Record<FacetKey, string[]>> }[] = []
  if (item?.kind && item.grade) related.push({ label: `Other packs of ${item.grade} ${item.kind.toLowerCase()}`, f: { kind: [item.kind], grade: [item.grade] } })
  if (item?.kind) related.push({ label: `All ${item.kind.toLowerCase()} in ${item.brand}`, f: { kind: [item.kind], brand: [item.sheet] } })
  if (item) related.push({ label: `Everything in the ${item.brand} tab`, f: { brand: [item.sheet] } })

  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-lg"
        onKeyDown={(e) => {
          if (!inList) return
          const t = e.target as HTMLElement
          if (t.closest("input, textarea")) return
          if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); onStep(1) }
          if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); onStep(-1) }
        }}
      >
        {item && (
          <>
            <div className="flex items-center gap-1 border-b py-2 pr-12 pl-3">
              <Button variant="ghost" size="icon-sm" aria-label="Previous item (↑)" title="Previous item (↑)" disabled={!inList || index === 0} onClick={() => onStep(-1)}>
                <ChevronUpIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next item (↓)" title="Next item (↓)" disabled={!inList || index >= total - 1} onClick={() => onStep(1)}>
                <ChevronDownIcon />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {inList ? `${(index + 1).toLocaleString()} of ${total.toLocaleString()} results` : "Not in current results"}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-muted-foreground"
                title="Copy a link straight to this item"
                onClick={() => copyToClipboard(window.location.href, "Link copied")}
              >
                <LinkIcon /> Copy link
              </Button>
            </div>
            <SheetHeader className="gap-1.5 border-b">
              <span className="flex items-center gap-1 font-mono text-sm font-medium text-brand">
                {item.ItemNumber || "No item number"}
                {item.ItemNumber && <CopyButton value={item.ItemNumber} label="item number" />}
              </span>
              <SheetTitle className="font-heading text-xl leading-tight font-semibold text-balance">
                {item.ItemDescription || item.ShortDescription}
              </SheetTitle>
              <SheetDescription>
                {item.added ? (
                  <>
                    Brand <span className="font-medium text-foreground">{item.sheet}</span> · added in this app{" "}
                    {new Date(item.added.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, not in the Google Sheet yet
                  </>
                ) : (
                  <>Tab <span className="font-medium text-foreground">{item.sheet}</span>, row {item.row}</>
                )}
              </SheetDescription>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button variant="outline" size="sm" onClick={() => onAddSimilar(item)}>
                  <CopyPlusIcon /> Add similar item
                </Button>
                {item.added && (
                  <Button variant="outline" size="sm" className="text-warn hover:text-warn" onClick={() => onRemove(item)}>
                    <Trash2Icon /> Remove
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {item.kind && (
                  <Badge variant="secondary" title={item.kindGuessed ? "Guessed from the description (no item class)" : undefined}>
                    {item.kind}{item.kindGuessed && "*"}
                  </Badge>
                )}
                {item.grade && <Badge variant="secondary">{item.grade}</Badge>}
                {item.pack && <Badge variant="secondary">{item.pack}</Badge>}
                {item.flags.map((f) => (
                  <Badge key={f} className="bg-warn-soft text-warn">{f}</Badge>
                ))}
              </div>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1">
              <div className="px-4 pb-8">
                {others.length > 0 && (
                  <div className="mt-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">
                    This item number is also in:{" "}
                    {others.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && ", "}
                        <Button variant="link" className="h-auto p-0 text-warn underline" onClick={() => onOpenItem(o.id)}>
                          {o.sheet} row {o.row}
                        </Button>
                      </span>
                    ))}
                  </div>
                )}

                <section>
                  <h3 className="mt-5 mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Find related</h3>
                  <div className="grid gap-1">
                    {related.map((r) => (
                      <Button key={r.label} variant="outline" size="sm" className="h-auto justify-start py-1.5 text-left whitespace-normal" onClick={() => onBrowse(r.f)}>
                        {r.label}
                      </Button>
                    ))}
                  </div>
                </section>

                {GROUPS.map(([title, keys]) => (
                  <section key={title}>
                    <h3 className="mt-5 mb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
                    <dl className="grid grid-cols-[minmax(120px,40%)_minmax(0,1fr)] border-t text-sm">
                      {keys.map((k) => (
                        <div key={k} className="contents">
                          <dt className="border-b py-1.5 pr-3 text-muted-foreground">{FIELD_LABEL[k]}</dt>
                          <dd className="flex min-h-9 items-center justify-between gap-2 border-b py-1">
                            {k === "BarcodeNumber" ? <BarcodeValue v={item[k]} packCode={item.packBarcode} packUnit={item.packUnit} pack={item.pack} /> : <Value v={item[k]} />}
                            {item[k] && COPYABLE.has(k) && <CopyButton value={item[k]} label={FIELD_LABEL[k]} />}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                {item.kindGuessed && (
                  <p className="mt-4 text-xs text-muted-foreground">* Product type guessed from the description because this row has no item class.</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
