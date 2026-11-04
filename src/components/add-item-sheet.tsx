"use client"

import { useMemo, useState } from "react"
import { ChevronDownIcon, PlusIcon, TagIcon } from "lucide-react"
import { toast } from "sonner"
import { BarcodeField, type BarcodeMode } from "@/components/barcode-field"
import { BrandPicker } from "@/components/brand-picker"
import { TicketLookup } from "@/components/ticket-lookup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { brandCode, nextSequence, unitCodeForPack, unitCodeForUm } from "@/lib/barcode"
import { brandName, compareBrand, derivePack, normalize, type AddedItem, type Item } from "@/lib/items"
import { CLASS_PARTS, type Ticket } from "@/lib/jotform"
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

/** One form field: key, required, where suggestions come from, hint, and whether it spans both columns. */
type FieldSpec = { k: FieldKey; required?: boolean; suggest?: (o: Item) => string; hint?: string; wide?: boolean; mono?: boolean }

/** The form, in sections. Barcode has its own block. */
const SECTIONS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: "Item",
    fields: [
      { k: "ItemDescription", required: true, wide: true, hint: "e.g. PLATINUM HYDRAULIC OIL AW 68 D200" },
      { k: "ShortDescription", wide: true, hint: "Leave blank to use the description" },
      { k: "ItemNumber", mono: true, hint: "Optional. If filled in, it must be new. e.g. FGE1700-O" },
      { k: "ItemType", suggest: (o) => o.ItemType },
    ],
  },
  {
    title: "Classification",
    fields: [
      { k: "ItemClassId", wide: true, suggest: (o) => o.ItemClassId, hint: "Category > Product Family > Grade > Product Type > Industry > Packaging > Packaging Size" },
      { k: "ProductGroupId", suggest: (o) => o.ProductGroupId },
    ],
  },
  {
    title: "Units",
    fields: [
      { k: "StockUmId", suggest: (o) => o.StockUmId, hint: "e.g. DRUM, PAIL, BOTTLE. Sets the last two digits of the barcode." },
      { k: "BillingUmId", suggest: (o) => o.BillingUmId },
      { k: "PackUmId", suggest: (o) => o.PackUmId },
    ],
  },
]
const FORM_KEYS = new Set<FieldKey>([...SECTIONS.flatMap((s) => s.fields.map((f) => f.k)), "BarcodeNumber", "Remarks"])
const NOT_COPIED = new Set<FieldKey>(["ItemNumber", "BarcodeNumber"])

function startDraft(from: Item | null, sheet: string, copyAll: boolean): Draft {
  if (!from) return { sheet, ItemType: "Finished Goods" }
  const d: Draft = { sheet: from.sheet }
  FIELDS.forEach(([k]) => {
    if ((copyAll || !NOT_COPIED.has(k)) && from[k]) d[k] = from[k]
  })
  return d
}

export function AddItemSheet({
  open,
  onOpenChange,
  items,
  template,
  editing,
  defaultSheet,
  brands,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: Item[]
  /** Item to copy details and inventory settings from ("Add similar item"). */
  template: Item | null
  /** An item added in the app, to change. */
  editing: Item | null
  defaultSheet: string
  brands: BrandOption[]
  onSaved: (item: AddedItem, edited: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-3xl">
        {/* Remount on each open so the form starts fresh. */}
        {open && (
          <AddItemForm
            key={editing?.added?.uid ?? "new"}
            items={items}
            template={template}
            editing={editing}
            defaultSheet={defaultSheet}
            brands={brands}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function AddItemForm({
  items,
  template,
  editing,
  defaultSheet,
  brands,
  onSaved,
  onCancel,
}: {
  items: Item[]
  template: Item | null
  editing: Item | null
  defaultSheet: string
  brands: BrandOption[]
  onSaved: (item: AddedItem, edited: boolean) => void
  onCancel: () => void
}) {
  const editUid = editing?.added?.uid
  const [draft, setDraft] = useState<Draft>(() => startDraft(editing ?? template, defaultSheet, !!editing))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [brandMode, setBrandMode] = useState<"existing" | "new">(() =>
    editing && !brands.some((b) => b.sheet === editing.sheet) ? "new" : "existing",
  )
  const [newBrand, setNewBrand] = useState(() => (editing && !brands.some((b) => b.sheet === editing.sheet) ? editing.sheet : ""))
  const newKey = normalize(brandName(newBrand))
  // A "new" brand that is really an existing one under another spelling.
  const sameBrand = newKey ? brands.find((b) => normalize(b.name) === newKey || normalize(b.sheet) === normalize(newBrand)) : undefined
  const chosen = brands.find((b) => b.sheet === draft.sheet)
  // Everything else, without the item being edited (its own barcode and number are not a clash).
  const others = useMemo(() => (editUid ? items.filter((o) => o.added?.uid !== editUid) : items), [items, editUid])

  const options = useMemo(() => {
    const uniq = (get: (o: Item) => string) => [...new Set(items.map(get).filter(Boolean))].sort(compareBrand)
    const m = new Map<FieldKey, string[]>()
    SECTIONS.forEach((s) => s.fields.forEach((f) => f.suggest && m.set(f.k, uniq(f.suggest))))
    return m
  }, [items])

  const num = (draft.ItemNumber ?? "").trim().toLowerCase()
  const clash = num ? others.find((o) => o.ItemNumber.toLowerCase() === num) : undefined
  const copiedSettings = template && !editing ? FIELDS.filter(([k]) => !FORM_KEYS.has(k) && template[k]).length : 0
  const set = (k: FieldKey | "sheet", v: string) => setDraft((d) => ({ ...d, [k]: v }))

  // ---- Barcode (Identifier rule): brand code + next item number in the brand + unit code (Stock U/M)
  // An item being edited keeps its barcode unless it is changed or regenerated.
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>(editing ? "manual" : "auto")
  const [unitPicked, setUnitPicked] = useState("")
  const barcodeRows = useMemo(() => others.map((o) => ({ sheet: o.sheet, barcode: o.BarcodeNumber })), [others])
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
  const sameBarcode = !autoBarcode && typedBarcode ? others.find((o) => o.BarcodeNumber === typedBarcode || o.packBarcode === typedBarcode) : undefined
  const barcodeError = sameBarcode ? `Already used by “${sameBarcode.ItemDescription}” in ${sameBarcode.brand}.` : undefined

  function fromTicket(t: Ticket) {
    const match = t.brand ? brands.find((b) => normalize(b.name) === normalize(t.brand) || normalize(b.sheet) === normalize(t.brand)) : undefined
    // Requesters sometimes type the pack ("24X1") as Stock U/M; only take real units.
    const knownUm = options.get("StockUmId")?.find((u) => normalize(u) === normalize(t.stockUm))
    setDraft((d) => ({
      ...d,
      ItemType: t.itemType,
      ItemClassId: t.itemClass,
      ...(t.description ? { ItemDescription: t.description } : {}),
      ...(knownUm ? { StockUmId: knownUm } : {}),
      ...(match ? { sheet: match.sheet } : {}),
    }))
    if (match) {
      setBrandMode("existing")
      setNewBrand("")
    }
  }

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
      const res = await fetch(editUid ? `/api/items?uid=${encodeURIComponent(editUid)}` : "/api/items", {
        method: editUid ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet, fields, autoBarcodeUnit: autoBarcode ? unitCode : undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Server error ${res.status}`)
      const saved = body as AddedItem
      const label = `${fields.ItemNumber || fields.ItemDescription} (barcode ${saved.fields.BarcodeNumber})`
      toast.success(
        editUid ? `Saved changes to ${label}` : brandMode === "new" && !sameBrand ? `Created brand ${brandName(sheet)} and added ${label}` : `Added ${label}`,
      )
      onSaved(saved, !!editUid)
    } catch (err) {
      setError((err as Error).message === "Failed to fetch" ? "Could not reach the app server. Is it running?" : (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const classParts = (draft.ItemClassId ?? "").split(">").map((p) => p.trim())
  const showParts = (draft.ItemClassId ?? "").includes(">")

  const renderField = ({ k, required, hint, wide, mono }: FieldSpec) => {
    const list = options.get(k)
    const isNum = k === "ItemNumber"
    return (
      <Field
        key={k}
        label={FIELD_LABEL[k]}
        required={required}
        hint={hint}
        wide={wide}
        error={isNum && clash ? `Already used by “${clash.ItemDescription}” in ${clash.brand}.` : undefined}
      >
        <Input
          required={required}
          list={list ? `add-${k}` : undefined}
          value={draft[k] ?? ""}
          onChange={(e) => set(k, e.target.value)}
          autoFocus={isNum && !!template && !editing}
          aria-invalid={isNum && !!clash}
          className={mono ? "font-mono" : undefined}
        />
        {list && (
          <datalist id={`add-${k}`}>
            {list.slice(0, 400).map((v) => <option key={v} value={v} />)}
          </datalist>
        )}
        {k === "ItemClassId" && showParts && (
          <dl className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
            {CLASS_PARTS.map(([pk, label], i) => (
              <div key={pk} className="rounded-md bg-muted px-2 py-1">
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
                <dd className={cn("truncate text-xs font-medium", !classParts[i] && "text-warn")} title={classParts[i]}>
                  {classParts[i] || "Blank"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Field>
    )
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="font-heading text-xl font-semibold">
          {editing ? "Edit added item" : template ? "Add similar item" : "Add item"}
        </SheetTitle>
        <SheetDescription>
          {editing ? (
            <>
              Changing <span className="font-medium text-foreground">{editing.ItemNumber || editing.ItemDescription}</span>, added{" "}
              {new Date(editing.added!.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. It keeps its barcode unless you
              change it.
            </>
          ) : template ? (
            <>Starts from <span className="font-medium text-foreground">{template.ItemNumber || template.ItemDescription}</span>. Change what differs.</>
          ) : (
            "Saved in this app for everyone using it. It does not change the Google Sheet."
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto p-4 sm:p-6">
        <TicketLookup onLoaded={fromTicket} />

        <Section title="Brand">
          <div className="grid gap-2 sm:col-span-2">
            <div role="radiogroup" aria-label="Brand" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:max-w-sm">
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
                  placeholder={editing ? editing.sheet : "e.g. ITEM MASTER NEWBRAND"}
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
          </div>
        </Section>

        {SECTIONS.map((s) => (
          <Section key={s.title} title={s.title}>
            {s.fields.map(renderField)}
          </Section>
        ))}

        <Section title="Barcode">
          <div className="sm:col-span-2">
            <BarcodeField
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
          </div>
        </Section>

        <Section title="Notes">
          {renderField({ k: "Remarks", wide: true })}
          {copiedSettings > 0 && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
              {copiedSettings} inventory settings (lot control, costing method, picking order…) are copied from {template?.ItemNumber || "the original item"}.
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-2 border-t p-3 sm:px-6">
        {error && <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{error}</p>}
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="flex-1 sm:flex-none sm:min-w-40" disabled={saving || !!clash || !!sameBarcode}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add item"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      <legend className="mb-3 w-full border-b pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

function Field({
  label,
  required,
  hint,
  error,
  wide,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={cn("grid content-start gap-1", wide && "sm:col-span-2")}>
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-warn"> *</span>}
      </span>
      {children}
      {error ? <span className="text-xs text-warn">{error}</span> : hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}
