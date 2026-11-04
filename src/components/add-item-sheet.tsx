"use client"

import { useMemo, useState } from "react"
import { ChevronDownIcon, PlusIcon, TagIcon } from "lucide-react"
import { toast } from "sonner"
import { BarcodeField, type BarcodeMode } from "@/components/barcode-field"
import { BrandPicker } from "@/components/brand-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { brandCode, nextSequence, unitCodeForPack, unitCodeForUm } from "@/lib/barcode"
import { brandName, compareBrand, derivePack, normalize, type AddedItem, type Item } from "@/lib/items"
import { FIELDS, FIELD_LABEL, type FieldKey } from "@/lib/parse-workbook"
import { cn } from "@/lib/utils"

export interface BrandOption {
  sheet: string
  name: string
  total: number
  added: number
}

type Draft = Partial<Record<FieldKey, string>> & { sheet: string }

export const UNASSIGNED = "Unassigned"

/** Fields shown in the form, in order. [key, required, suggestions source, hint] */
const FORM: [FieldKey, boolean, ((o: Item) => string) | null, string?][] = [
  ["ItemDescription", true, null, "e.g. PLATINUM HYDRAULIC OIL AW 68 D200"],
  ["StockUmId", false, (o) => o.StockUmId, "e.g. DRUM, PAIL, BOTTLE. Sets the last two digits of the barcode."],
  ["BarcodeNumber", true, null],
  ["ItemNumber", false, null, "Optional. If filled in, it must be new. e.g. FGE1700-O"],
  ["ShortDescription", false, null, "Leave blank to use the description"],
  ["ItemType", false, (o) => o.ItemType],
  ["ItemClassId", false, (o) => o.ItemClassId, "e.g. LUBES > AW > ISO VG 68 > HYDOIL > INDUSTRIAL > DR-200L > C&I"],
  ["ProductGroupId", false, (o) => o.ProductGroupId],
  ["BillingUmId", false, (o) => o.BillingUmId],
  ["PackUmId", false, (o) => o.PackUmId],
  ["Remarks", false, null],
]
const FORM_KEYS = new Set(FORM.map(([k]) => k))
const NOT_COPIED = new Set<FieldKey>(["ItemNumber", "BarcodeNumber"])

function startDraft(template: Item | null, sheet: string): Draft {
  if (!template) return { sheet, ItemType: "Finished Goods" }
  const d: Draft = { sheet: template.sheet }
  FIELDS.forEach(([k]) => {
    if (!NOT_COPIED.has(k) && template[k]) d[k] = template[k]
  })
  return d
}

export function AddItemSheet({
  open,
  onOpenChange,
  items,
  template,
  defaultSheet,
  brands,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: Item[]
  /** Item to copy details and inventory settings from ("Add similar item"). */
  template: Item | null
  defaultSheet: string
  brands: BrandOption[]
  onAdded: (item: AddedItem) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        {/* Remount on each open so the form starts fresh. */}
        {open && <AddItemForm items={items} template={template} defaultSheet={defaultSheet} brands={brands} onAdded={onAdded} onCancel={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function AddItemForm({
  items,
  template,
  defaultSheet,
  brands,
  onAdded,
  onCancel,
}: {
  items: Item[]
  template: Item | null
  defaultSheet: string
  brands: BrandOption[]
  onAdded: (item: AddedItem) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => startDraft(template, defaultSheet))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brandMode, setBrandMode] = useState<"existing" | "new">("existing")
  const [newBrand, setNewBrand] = useState("")
  const newKey = normalize(brandName(newBrand))
  // A "new" brand that is really an existing one under another spelling.
  const sameBrand = newKey ? brands.find((b) => normalize(b.name) === newKey || normalize(b.sheet) === normalize(newBrand)) : undefined
  const chosen = brands.find((b) => b.sheet === draft.sheet)

  const options = useMemo(() => {
    const uniq = (get: (o: Item) => string) => [...new Set(items.map(get).filter(Boolean))].sort(compareBrand)
    const m = new Map<FieldKey, string[]>()
    FORM.forEach(([k, , get]) => get && m.set(k, uniq(get)))
    return { byField: m }
  }, [items])

  const num = (draft.ItemNumber ?? "").trim().toLowerCase()
  const clash = num ? items.find((o) => o.ItemNumber.toLowerCase() === num) : undefined
  const copiedSettings = template ? FIELDS.filter(([k]) => !FORM_KEYS.has(k) && template[k]).length : 0
  const set = (k: FieldKey | "sheet", v: string) => setDraft((d) => ({ ...d, [k]: v }))

  // ---- Barcode (Identifier rule): brand code + next item number in the brand + unit code (Stock U/M)
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("auto")
  const [unitPicked, setUnitPicked] = useState("")
  const barcodeRows = useMemo(() => items.map((o) => ({ sheet: o.sheet, barcode: o.BarcodeNumber })), [items])
  const targetSheet = brandMode === "new" ? (sameBrand?.sheet ?? newBrand.trim()) : draft.sheet
  const brand = targetSheet ? brandCode(barcodeRows, targetSheet) : null
  const seq = brand ? nextSequence(barcodeRows, brand.code) : null
  const packFromText = derivePack((draft.ItemClassId ?? "").split(">").map((x) => x.trim()), `${draft.ItemDescription ?? ""} ${draft.ShortDescription ?? ""}`)
  const umUnit = unitCodeForUm(draft.StockUmId ?? "")
  const packUnit = unitCodeForPack(packFromText)
  const unitCode = unitPicked || umUnit || packUnit || ""
  const unitFrom = unitPicked ? "" : umUnit ? `Stock U/M “${draft.StockUmId?.trim()}”` : packUnit ? `“${packFromText}” in the description` : ""
  const autoBarcode = barcodeMode === "auto"
  const typedBarcode = (draft.BarcodeNumber ?? "").trim()
  const sameBarcode = !autoBarcode && typedBarcode ? items.find((o) => o.BarcodeNumber === typedBarcode || o.packBarcode === typedBarcode) : undefined
  const barcodeError = sameBarcode ? `Already used by “${sameBarcode.ItemDescription}” in ${sameBarcode.brand}.` : undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (clash || sameBarcode) return
    if (autoBarcode && !brand) return setError("Choose a brand to generate the barcode, or switch to Type it.")
    if (autoBarcode && !unitCode) return setError("Choose the unit so the barcode can be generated.")
    // No brand chosen: it goes in an "Unassigned" tab so it can still be found.
    const sheet = targetSheet || UNASSIGNED
    setSaving(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sheet: _picked, BarcodeNumber, ...rest } = draft
    const fields = {
      ...rest,
      ...(autoBarcode ? {} : { BarcodeNumber }),
      ShortDescription: rest.ShortDescription?.trim() || rest.ItemDescription,
    }
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet, fields, autoBarcodeUnit: autoBarcode ? unitCode : undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`)
      const saved = body as AddedItem
      const label = `${fields.ItemNumber || fields.ItemDescription} (barcode ${saved.fields.BarcodeNumber})`
      toast.success(brandMode === "new" && !sameBrand ? `Created brand ${brandName(sheet)} and added ${label}` : `Added ${label}`)
      onAdded(body as AddedItem)
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "Could not reach the app server. Is it running?" : (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="font-heading text-xl font-semibold">{template ? "Add similar item" : "Add item"}</SheetTitle>
        <SheetDescription>
          {template ? (
            <>Starts from <span className="font-medium text-foreground">{template.ItemNumber || template.ItemDescription}</span>. Change what differs.</>
          ) : (
            "Saved in this app for everyone using it. It does not change the Google Sheet."
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4">
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Brand</legend>
          <div role="radiogroup" aria-label="Brand" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={brandMode === m}
                onClick={() => setBrandMode(m)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  brandMode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "existing" ? <><TagIcon className="size-3.5" /> Existing brand</> : <><PlusIcon className="size-3.5" /> New brand</>}
              </button>
            ))}
          </div>

          {brandMode === "existing" ? (
            <>
              <BrandPicker
                brands={brands.map((b) => ({ ...b, count: b.total }))}
                value={draft.sheet}
                onSelect={(v) => set("sheet", v)}
                align="start"
                trigger={
                  <Button type="button" variant="outline" className="h-9 w-full justify-between font-normal">
                    {chosen ? <span className="truncate font-medium">{chosen.name}</span> : <span className="text-muted-foreground">Choose from {brands.length} brands…</span>}
                    <ChevronDownIcon className="text-muted-foreground" />
                  </Button>
                }
              />
              <span className="text-xs text-muted-foreground">
                {chosen ? `${chosen.total.toLocaleString()} items in this brand. Tab: ${chosen.sheet}` : "Optional. Leave empty to put it under Unassigned. Not listed? Choose New brand."}
              </span>
            </>
          ) : (
            <>
              <Input
                autoFocus
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="e.g. ITEM MASTER NEWBRAND"
                aria-label="New brand name"
                maxLength={100}
              />
              {sameBrand ? (
                <span className="text-xs text-warn">
                  {sameBrand.name} already exists, so the item will go there.{" "}
                  <button type="button" className="underline" onClick={() => { set("sheet", sameBrand.sheet); setBrandMode("existing"); setNewBrand("") }}>
                    Use existing brand
                  </button>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {newBrand.trim() ? <>Creates a new <span className="font-medium text-foreground">{brandName(newBrand.trim())}</span> tab. </> : null}
                  Use the same name as the Google Sheet tab, so it matches when you copy it over.
                </span>
              )}
            </>
          )}
        </fieldset>

        {FORM.map(([k, required, , hint]) => {
          const list = options.byField.get(k)
          const isNum = k === "ItemNumber"
          if (k === "BarcodeNumber")
            return (
              <BarcodeField
                key={k}
                mode={barcodeMode}
                onMode={(m) => {
                  // Switching to typing starts from the generated number, so it only needs a small edit.
                  if (m === "manual" && !typedBarcode && brand && seq && unitCode) set("BarcodeNumber", brand.code + seq + unitCode)
                  setBarcodeMode(m)
                }}
                brand={brand}
                brandLabel={targetSheet ? brandName(targetSheet) : ""}
                seq={seq}
                unitCode={unitCode}
                unitFrom={unitFrom}
                onUnitCode={setUnitPicked}
                pack={packFromText}
                manual={draft.BarcodeNumber ?? ""}
                onManual={(v) => set("BarcodeNumber", v)}
                error={barcodeError}
              />
            )
          return (
            <Field key={k} label={FIELD_LABEL[k]} required={required} hint={hint} error={isNum && clash ? `Already used by “${clash.ItemDescription}” in ${clash.brand}.` : undefined}>
              <Input
                required={required}
                list={list ? `add-${k}` : undefined}
                value={draft[k] ?? ""}
                onChange={(e) => set(k, e.target.value)}
                autoFocus={isNum && !!template}
                aria-invalid={isNum && !!clash}
                className={isNum ? "font-mono" : undefined}
              />
              {list && (
                <datalist id={`add-${k}`}>
                  {list.slice(0, 400).map((v) => <option key={v} value={v} />)}
                </datalist>
              )}
            </Field>
          )
        })}

        {copiedSettings > 0 && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {copiedSettings} inventory settings (lot control, costing method, picking order…) are copied from {template?.ItemNumber || "the original item"}.
          </p>
        )}
      </div>

      <div className="grid gap-2 border-t p-3">
        {error && <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving || !!clash || !!sameBarcode}>
            {saving ? "Saving…" : "Add item"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-warn"> *</span>}
      </span>
      {children}
      {error ? <span className="text-xs text-warn">{error}</span> : hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}
