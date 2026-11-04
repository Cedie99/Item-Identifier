// Barcode numbering rule used in the item master (9 digits):
//
//   BBB   SSSS   UU
//   112   0001   06   → 112000106
//
//   BBB  = brand code. Official list: the Identifier workbook (Platinum 001, Comet 002 …), with ERP corrections below.
//   SSSS = item sequence inside that brand, counting up from 0001. Every item gets its own number.
//   UU   = unit code = the item's Stock U/M (Bottle 01, Box 02, Pail 03, Drum 04 … Kg 10 … LT 14).
//
// The Identifier is kept in identifier.json (refresh it with `npm run import-identifier`).
// Shared by the browser (preview in the Add item form) and the server (final number, assigned when saving).

import identifier from "./identifier.json"

/** Unit codes from the Identifier, e.g. { code: "04", label: "Drum" }. */
export const UNIT_CODES: { code: string; label: string }[] = identifier.units

/** What each unit means, for the dropdown. */
const UNIT_HINTS: Record<string, string> = {
  Bottle: "bottles, usually boxed (12X1, 24X1, 60X200ML)",
  Box: "box",
  Pail: "pail in liters (P18, P20)",
  Drum: "drum (D200)",
  Gal: "gallon / 4 liters (6X4, 4X4)",
  Kg: "by weight: grease pails and drums (P15KG, D180KG)",
  LT: "liter / bulk",
  Tub: "tub",
  Can: "can",
  Cup: "cup",
  IBC: "IBC tote",
  Sac: "sack",
  Car: "cartridge",
}
export const unitHint = (label: string) => UNIT_HINTS[label]

/** Brand name for matching: ignores "Item Master", case, spacing and punctuation. */
const norm = (s: string) => s.toUpperCase().replace(/^ITEM\s*MASTER\s*/, "").replace(/[^A-Z0-9]/g, "")

/**
 * Brand codes the ERP uses where the Identifier workbook says otherwise (keyed by norm(name)). These win over
 * the workbook and are kept here so re-importing the Identifier doesn't undo them. A code freed this way
 * becomes available again. null = the brand has no code in the ERP yet; it gets the next free number.
 */
const ERP_BRAND_CODES: Record<string, string | null> = {
  ILUBE: "112", // Identifier: 120
  LEVITRONN: null, // Identifier: 112, but not in the ERP item master yet
}
const erpCode = (name: string) => ERP_BRAND_CODES[norm(name)]

/** Brand list: the Identifier with the ERP corrections applied. */
const BRANDS: { name: string; code: string }[] = identifier.brands.flatMap((b) => {
  const fix = erpCode(b.name)
  if (fix === null) return []
  return [{ name: b.name, code: fix ?? b.code }]
})

export const unitCodeLabel = (code: string) => UNIT_CODES.find((u) => u.code === code)?.label

export interface ParsedBarcode {
  brand: string
  seq: string
  unit: string
}

export function parseBarcode(bc: string): ParsedBarcode | null {
  const m = /^(\d{3})(\d{4})(\d{2})$/.exec(bc.trim())
  return m ? { brand: m[1], seq: m[2], unit: m[3] } : null
}

/** Minimal shape needed: works with app items and raw sheet rows alike. */
export interface BarcodeRow {
  sheet: string
  barcode: string
}

const mostCommon = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0]

// ---------- Brand code ----------

/** Tab names spelled differently from the Identifier. */
const ALIASES: Record<string, string> = { VILLIAN: "VILLAIN", VHENWORKS: "VHENWORKZ", PLATINUMINT: "PLATINUMINTL" }

/** The Identifier entry for a brand tab, matched by name (ignores "Item Master", spacing and punctuation). */
export function identifierBrand(sheet: string): { name: string; code: string } | null {
  const n = ALIASES[norm(sheet)] ?? norm(sheet)
  if (!n) return null
  const exact = BRANDS.find((b) => norm(b.name) === n)
  if (exact) return exact
  // "Relialube" ~ RELIALUBES, "Qmi" ~ Q-MI & JAMEX, "Comet FG" ~ COMET: closest-length name that starts the same.
  const close = BRANDS
    .filter((b) => norm(b.name).startsWith(n) || n.startsWith(norm(b.name)))
    .sort((a, b) => Math.abs(norm(a.name).length - n.length) - Math.abs(norm(b.name).length - n.length))
  return close[0] ?? null
}

/** Brand code most of a tab's existing barcodes use. */
function sheetBrandCode(rows: BarcodeRow[], sheet: string): string | null {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (r.sheet !== sheet) continue
    const p = parseBarcode(r.barcode)
    if (p) m.set(p.brand, (m.get(p.brand) ?? 0) + 1)
  }
  return mostCommon(m) ?? null
}

/** First brand code not used by the Identifier or by any barcode, e.g. 120. */
export function nextFreeBrandCode(rows: BarcodeRow[]): string {
  const taken = new Set(BRANDS.map((b) => b.code))
  for (const r of rows) {
    const p = parseBarcode(r.barcode)
    if (p) taken.add(p.brand)
  }
  let max = 0
  taken.forEach((c) => (max = Math.max(max, Number(c))))
  return String(max + 1).padStart(3, "0")
}

export interface BrandCode {
  code: string
  /** sheet = from the brand's existing barcodes; identifier = from the Identifier list; new = next free number. */
  source: "sheet" | "identifier" | "new"
  /** Set when the Identifier lists this brand under a different code than its barcodes use. */
  identifierCode?: string
  /** Set when the Identifier gives this code to a different brand (e.g. REPSUTEK uses 115, listed there as VORTEX PLUS). */
  listedFor?: string
}

/**
 * Brand code for a tab: an ERP correction if there is one; otherwise the code most of its existing barcodes use (the majority wins over messy outliers);
 * otherwise the Identifier's code; otherwise the next free number.
 */
export function brandCode(rows: BarcodeRow[], sheet: string): BrandCode {
  // ERP corrections are authoritative, even over stray barcodes in the tab (LEVITRONN's tab holds one 109 = BAGANI).
  const erp = erpCode(sheet)
  if (erp) return { code: erp, source: "identifier" }
  if (erp === null) {
    // No ERP code yet: keep the code this tab's own new items got, skipping codes other brands own.
    const own = sheetBrandCode(rows.filter((r) => !BRANDS.some((b) => b.code === parseBarcode(r.barcode)?.brand)), sheet)
    return own ? { code: own, source: "sheet" } : { code: nextFreeBrandCode(rows), source: "new" }
  }
  const used = sheetBrandCode(rows, sheet)
  const listed = identifierBrand(sheet)?.code
  if (used) {
    const owner = BRANDS.find((b) => b.code === used)?.name
    const mine = identifierBrand(sheet)?.name
    return {
      code: used,
      source: "sheet",
      identifierCode: listed && listed !== used ? listed : undefined,
      listedFor: owner && owner !== mine ? owner : undefined,
    }
  }
  if (listed) return { code: listed, source: "identifier" }
  return { code: nextFreeBrandCode(rows), source: "new" }
}

/** Next item number in a brand: one after the highest used with that brand code. */
export function nextSequence(rows: BarcodeRow[], code: string): string {
  let max = 0
  for (const r of rows) {
    const p = parseBarcode(r.barcode)
    if (p && p.brand === code) max = Math.max(max, Number(p.seq))
  }
  return String(max + 1).padStart(4, "0")
}

// ---------- Unit code ----------

/** Unit code from the Stock U/M (DRUM → 04). */
export function unitCodeForUm(um: string): string | null {
  const u = um.trim().toUpperCase()
  if (!u) return null
  const alias: Record<string, string> = { BOTTLES: "BOTTLE", GALLON: "GAL", LITER: "LT", L: "LT", KILO: "KG", PCS: "PC", PIECE: "PC" }
  const key = alias[u] ?? u
  return UNIT_CODES.find((c) => c.label.toUpperCase() === key)?.code ?? null
}

/** Unit code guessed from the pack size in the description ("Drum 200L" → Drum 04), for when Stock U/M is empty. */
export function unitCodeForPack(pack: string): string | null {
  if (!pack) return null
  const byLabel = (l: string) => UNIT_CODES.find((c) => c.label === l)?.code ?? null
  if (/kg$/.test(pack) && /^(Drum|Pail)/.test(pack)) return byLabel("Kg")
  if (pack.startsWith("Drum")) return byLabel("Drum")
  if (pack.startsWith("Pail")) return byLabel("Pail")
  if (/×4L$|Gallon/.test(pack)) return byLabel("Gal")
  if (/^Box .*(mL|L)$/.test(pack)) return byLabel("Bottle")
  if (/Liter/.test(pack)) return byLabel("LT")
  return null
}

export const composeBarcode = (brand: string, seq: string, unit: string) => `${brand}${seq}${unit}`

// ---------- Pack barcode ----------

const codeOf = (label: string, fallback: string) => UNIT_CODES.find((u) => u.label === label)?.code ?? fallback
const BOX = codeOf("Box", "02")
const PAIL = codeOf("Pail", "03")
const DRUM = codeOf("Drum", "04")
const KG = codeOf("Kg", "10")
/** Units that come packed in a box: Bottle (12X1L, 60X200ML), Gal (6X4, 4X4), Cup (144X50G), Can (12X500G). */
const BOXED_UNITS = new Set([codeOf("Bottle", "01"), codeOf("Gal", "06"), codeOf("Cup", "08"), codeOf("Can", "09")])

export interface PackBarcode {
  barcode: string
  /** The pack this barcode is for: Box, Pail or Drum. */
  unit: string
}

/**
 * The second barcode an item has for the pack it comes in: the same number, ending in the pack's unit code.
 *   Bottle, Gal, Cup, Can in a box → Box          (108000901 → 108000902, 003004306 → 003004302)
 *   Kg in a pail or drum           → Pail / Drum  (074002510 P15KG → 074002503, 003004910 D180KG → 003004904)
 * Null for anything else, e.g. a loose sample bottle or a single can.
 */
export function packBarcode(barcode: string, pack: string): PackBarcode | null {
  const p = parseBarcode(barcode)
  if (!p) return null
  const to = (unit: string) => ({ barcode: composeBarcode(p.brand, p.seq, unit), unit: unitCodeLabel(unit) ?? unit })
  if (BOXED_UNITS.has(p.unit) && pack.startsWith("Box")) return to(BOX)
  if (p.unit === KG && pack.startsWith("Drum")) return to(DRUM)
  if (p.unit === KG && pack.startsWith("Pail")) return to(PAIL)
  return null
}
