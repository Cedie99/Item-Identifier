"use client"

import { InfoIcon, WandSparklesIcon } from "lucide-react"
import { CopyButton } from "@/components/copy-button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { packBarcode, parseBarcode, UNIT_CODES, unitCodeLabel, unitHint, type BrandCode } from "@/lib/barcode"
import { cn } from "@/lib/utils"

export type BarcodeMode = "auto" | "manual"

/** Barcode input: generated from the Identifier rule (brand code + item sequence + unit code) or typed in. */
export function BarcodeField({
  mode,
  onMode,
  brand,
  brandLabel,
  seq,
  unitCode,
  unitFrom,
  onUnitCode,
  pack,
  manual,
  onManual,
  error,
}: {
  mode: BarcodeMode
  onMode: (m: BarcodeMode) => void
  /** Brand code and where it came from, or null when no brand is chosen yet. */
  brand: BrandCode | null
  brandLabel: string
  seq: string | null
  unitCode: string
  /** Where the unit code was picked from, e.g. "Stock U/M DRUM" or "“Drum 200L” in the description". */
  unitFrom: string
  onUnitCode: (code: string) => void
  /** Pack size from the description (Box 12×1L, Pail 15kg…); boxed and kg items also get a pack barcode. */
  pack: string
  manual: string
  onManual: (v: string) => void
  error?: string
}) {
  const parsed = parseBarcode(manual)
  const unitItems = UNIT_CODES.map((u) => ({ value: u.code, label: `${u.code} · ${u.label}` }))
  const unitName = unitCodeLabel(unitCode)
  const pb = packBarcode(mode === "auto" ? `${brand?.code ?? ""}${seq ?? ""}${unitCode}` : manual, pack)
  const packLine = pb && (
    <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {pb.unit} barcode: <span className="font-mono text-foreground">{pb.barcode}</span> (same number, unit {pb.barcode.slice(7)} {pb.unit},
      for the {pack})
    </span>
  )

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          Barcode Number<span className="text-warn"> *</span>
        </span>
        <div role="radiogroup" aria-label="Barcode" className="flex gap-0.5 rounded-md bg-muted p-0.5 text-xs">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => onMode(m)}
              className={cn(
                "rounded px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "auto" ? "Generate" : "Type it"}
            </button>
          ))}
        </div>
      </div>

      {mode === "auto" ? (
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
          {brand ? (
            <>
              <div className="grid gap-1">
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
                  {/* One plain number, so it can be selected and copied in one go. */}
                  <output aria-label="Barcode preview" className="flex-1 font-mono text-xl font-semibold tracking-wider text-brand select-all">
                    {brand.code}
                    {seq ?? "····"}
                    {unitCode || "··"}
                  </output>
                  {seq && unitCode && <CopyButton value={brand.code + seq + unitCode} label="barcode" />}
                </div>
                <span className="text-xs text-muted-foreground">
                  {brand.code} = {brandLabel}
                  {brand.source === "new" && " (new brand code)"} · {seq ?? "····"} = item #{seq ? Number(seq) : "?"} in brand ·{" "}
                  {unitCode || "··"} = {unitName ?? "choose the unit below"}
                </span>
                {packLine}
              </div>

              {brand.source === "new" && (
                <Note>
                  {brand.code} is the next free brand code in the Identifier list. Add {brandLabel} = {brand.code} to the Identifier sheet too.
                </Note>
              )}
              <label className="grid gap-1">
                <span className="text-xs font-medium">Unit (Stock U/M)</span>
                <Select items={unitItems} value={unitCode || null} onValueChange={(v) => onUnitCode(String(v ?? ""))}>
                  <SelectTrigger className="h-9 w-full bg-background" aria-label="Unit code">
                    <SelectValue placeholder="Choose the unit…" />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} className="max-h-80">
                    {UNIT_CODES.map((u) => (
                      <SelectItem key={u.code} value={u.code}>
                        <span className="font-mono">{u.code}</span> {u.label}
                        {unitHint(u.label) && <span className="text-xs text-muted-foreground">({unitHint(u.label)})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {unitFrom && unitCode ? (
                    <><WandSparklesIcon className="mr-1 inline size-3 text-brand" />Picked from {unitFrom}. Change it if needed.</>
                  ) : (
                    "Filling in Stock U/M, or the pack size in the description (D200, P20, 12X1…), picks this for you."
                  )}
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                The final number is given when you save, so it stays unique even if someone else adds to {brandLabel} at the same time.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Choose a brand above to generate the barcode, or switch to <span className="font-medium text-foreground">Type it</span>.
            </p>
          )}
        </div>
      ) : (
        <>
          <Input
            required
            inputMode="numeric"
            value={manual}
            onChange={(e) => onManual(e.target.value)}
            aria-invalid={!!error}
            placeholder="e.g. 112000306"
            className="font-mono"
          />
          {error ? (
            <span className="text-xs text-warn">{error}</span>
          ) : parsed ? (
            <span className="text-xs text-muted-foreground">
              Brand {parsed.brand} · item {parsed.seq} · unit {parsed.unit}
              {unitCodeLabel(parsed.unit) ? ` (${unitCodeLabel(parsed.unit)})` : ""}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">9 digits: brand code (3) + item number in brand (4) + unit code (2).</span>
          )}
          {!error && packLine}
        </>
      )}
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 rounded-md bg-brand-soft/70 px-2 py-1.5 text-xs">
      <InfoIcon className="mt-px size-3.5 shrink-0 text-brand" />
      <span>{children}</span>
    </p>
  )
}
