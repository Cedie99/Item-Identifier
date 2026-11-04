import { FIELDS, type Dataset, type FieldKey } from "./parse-workbook"

export type Item = Record<FieldKey, string> & {
  id: number
  sheet: string
  brand: string
  row: number
  flags: string[]
  /** Friendly product type (Hydraulic oil, Gear oil…), from the item class or guessed from the description. */
  kind: string
  kindGuessed: boolean
  /** Viscosity / grade (SAE 15W-40, ISO VG 68, NLGI 2…). */
  grade: string
  /** Pack size (Drum 200L, Pail 20L, Box 12×1L…). */
  pack: string
  hay: string
  hayCompact: string
  /** Set for items people added in this app (not yet in the Google Sheet). */
  added?: { uid: string; at: string }
}

/** An item someone added through the app. Saved by the server in data/added-items.json. */
export interface AddedItem {
  uid: string
  /** Brand tab it belongs to (the Google Sheet tab name). */
  sheet: string
  fields: Partial<Record<FieldKey, string>>
  addedAt: string
}

export const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export const brandName = (sheet: string) => sheet.replace(/^item\s*master\s*/i, "").trim() || sheet

export const compareBrand = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })

const SEARCH_FIELDS: FieldKey[] = [
  "ItemNumber", "ItemDescription", "ShortDescription", "BarcodeNumber",
  "ItemClassId", "ProductGroupId", "RecordOwner", "Remarks", "StockUmId",
]

// ---------- Derived "browse by" fields ----------

const KIND_BY_CODE: Record<string, string> = {
  DEO: "Diesel engine oil",
  GEO: "Gasoline engine oil",
  "2T/4TOIL": "Motorcycle oil (2T/4T)",
  HYDOIL: "Hydraulic oil",
  GEAROIL: "Gear oil",
  IGO: "Industrial gear oil",
  GREASE: "Grease",
  COOLANT: "Coolant",
  COMPOIL: "Compressor oil",
  ATF: "Transmission fluid (ATF)",
  SPECIALTY: "Specialty",
  CHEMICALS: "Chemicals",
  METALWORKING: "Metalworking fluid",
  SLIDEWAYOIL: "Slideway oil",
  RAWMAT: "Raw material",
  SPINDLEOIL: "Spindle oil",
  BFLUID: "Brake fluid",
  HEATRANSFEROIL: "Heat transfer oil",
  FLUSHOIL: "Flushing oil",
  PNEUMATICOIL: "Pneumatic oil",
  TURBINEOIL: "Turbine oil",
  QUENCHINGOIL: "Quenching oil",
  UTTF: "Tractor fluid (UTTF)",
  WRL: "Wire rope lubricant",
  TRO: "Transformer oil",
  MARINEOIL: "Marine oil",
  OGL: "Open gear lubricant",
  EDM: "EDM fluid",
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** Ordered: the first pattern that matches the description wins. */
const KIND_GUESS: [RegExp, string][] = [
  [/BASE OIL|\bBS\s?\d{3}\b|\bN\d{3}\b|\bSN\s?\d{3}\b/, "Base oil"],
  [/\bDEO\b/, "Diesel engine oil"],
  [/WIRE ROPE/, "Wire rope lubricant"],
  [/THERMAL OIL/, "Heat transfer oil"],
  [/VACUUM PUMP/, "Vacuum pump oil"],
  [/BRAKE FLUID|\bDOT\s?[345]\b/, "Brake fluid"],
  [/COOLANT|ANTI-?FREEZE/, "Coolant"],
  [/GREASE|\bNLGI\b/, "Grease"],
  [/\bATF\b|DEXRON|\bDX\s?III\b|TRANSMISSION/, "Transmission fluid (ATF)"],
  [/SLIDEWAY/, "Slideway oil"],
  [/TURBINE/, "Turbine oil"],
  [/COMPRESSOR/, "Compressor oil"],
  [/PNEUMATIC/, "Pneumatic oil"],
  [/SPINDLE/, "Spindle oil"],
  [/QUENCH/, "Quenching oil"],
  [/TRANSFORMER/, "Transformer oil"],
  [/FLUSH/, "Flushing oil"],
  [/HEAT TRANSFER/, "Heat transfer oil"],
  [/CUTTING|SOLUBLE|HYSOL|METALWORK/, "Metalworking fluid"],
  [/\bUTTF\b|TRACTOR|HYDROTRANS/, "Tractor fluid (UTTF)"],
  [/\b[24]T\b|JASO|MOTORCYCLE|SCOOTER/, "Motorcycle oil (2T/4T)"],
  [/\bIGO\b|INDUSTRIAL GEAR/, "Industrial gear oil"],
  [/GEAR|\bGL-?[1-5]\b/, "Gear oil"],
  [/HYDRAULIC|\bAW\s?\d|\bHVI\b|\bHYD\b/, "Hydraulic oil"],
  [/DIESEL|\bC[IHK]-?4\b|\bCF-?4\b|\bCD\b/, "Diesel engine oil"],
  [/GASOLINE|\bS[GJLMNP]\b/, "Gasoline engine oil"],
  [/\bCF\b/, "Diesel engine oil"],
]

function deriveKind(cls: string[], desc: string): [string, boolean] {
  const code = (cls[3] ?? "").toUpperCase()
  if (code) return [KIND_BY_CODE[code] ?? code, false]
  const d = desc.toUpperCase()
  for (const [re, k] of KIND_GUESS) if (re.test(d)) return [k, true]
  return ["", false]
}

function deriveGrade(cls: string[], desc: string): string {
  const c = (cls[2] ?? "").trim()
  if (c && c !== ".") return c.toUpperCase().replace(/\s+/g, " ")
  const d = desc.toUpperCase()
  let m: RegExpMatchArray | null
  if ((m = d.match(/\b(\d{1,2})W-?(\d{2,3})\b/))) return `SAE ${m[1]}W-${m[2]}`
  if ((m = d.match(/\bSAE\s*(\d{2,3})\b/))) return `SAE ${m[1]}`
  if ((m = d.match(/\b(?:ISO\s*)?VG\s*(\d{2,4})\b/))) return `ISO VG ${m[1]}`
  if ((m = d.match(/\b(?:AW|HVI|HYD|HYDRAULIC OIL|IGO EP|EP)\s*(\d{2,3})\b/))) return `ISO VG ${m[1]}`
  if ((m = d.match(/\bNLGI\s*#?\s*(\d)\b/) ?? d.match(/GREASE.*#\s*(\d)\b/))) return `NLGI ${m[1]}`
  if ((m = d.match(/\bDOT\s?(\d)\b/))) return `DOT ${m[1]}`
  return ""
}

const unitLabel = (u: string) => ({ ML: "mL", L: "L", G: "g", KG: "kg" })[u] ?? u.toLowerCase()

export function derivePack(cls: string[], desc: string): string {
  const d = desc.toUpperCase()
  let m: RegExpMatchArray | null
  if ((m = d.match(/\bB?N?D(\d{3})(KG)?L?\b/))) return `Drum ${m[1]}${m[2] ? "kg" : "L"}`
  if ((m = d.match(/\bP(\d{1,2})(KG)?\b/))) return `Pail ${m[1]}${m[2] ? "kg" : "L"}`
  if ((m = d.match(/\bDRUM\s?(\d{3})\s?(L|KG)?\b/))) return `Drum ${m[1]}${m[2] === "KG" ? "kg" : "L"}`
  if ((m = d.match(/\bPAIL\s?(\d{1,2})\s?(L|KG)?\b/))) return `Pail ${m[1]}${m[2] === "KG" ? "kg" : "L"}`
  if ((m = d.match(/\b(\d{1,3})X(\d+(?:\.\d+)?)(ML|L|G|KG)?\b/))) {
    // "12X800" with no unit means mL; "12X1" means liters.
    const unit = m[3] ?? (Number(m[2]) >= 100 ? "ML" : "L")
    return `Box ${m[1]}×${m[2]}${unitLabel(unit)}`
  }
  if (/\bLITER\b/.test(d)) return "1 Liter"
  if (/\bGALLON\b/.test(d)) return "Gallon"
  if ((m = d.match(/\b(\d+(?:\.\d+)?)\s?(ML|L|KG|G)\b/))) return `${m[1]}${unitLabel(m[2])}`
  // Fall back to the pack in the item class (DR-200L, PA-20L, BOX-12X1L…)
  const c = (cls[5] ?? "").toUpperCase()
  if ((m = c.match(/^(DR|DRUM)-(\d+)(L|KG)$/))) return `Drum ${m[2]}${m[3] === "KG" ? "kg" : "L"}`
  if ((m = c.match(/^(PA|PAIL)-(\d+)(L|KG)$/))) return `Pail ${m[2]}${m[3] === "KG" ? "kg" : "L"}`
  if ((m = c.match(/^BOX-(\d+)X([\d.]+)(ML|L|G|KG)$/))) return `Box ${m[1]}×${m[2]}${unitLabel(m[3])}`
  if ((m = c.match(/^(CONT|CAN|BULK)-([\d.]+)(ML|L|KG|GAL)$/))) return `${titleCase(m[1] === "CONT" ? "Container" : m[1])} ${m[2]}${m[3].toLowerCase()}`
  return ""
}

/** Extra words so "drum", "pail", "hydraulic"… find items whose description only says D200, P20, AW 68. */
const derivedWords = (o: Item) => [o.kind, o.grade, o.pack, o.grade.replace(/^SAE |^ISO /, "")].join(" ")

export function toItems(d: Dataset, added: AddedItem[] = []): Item[] {
  // Added items whose number has since appeared in the sheet are already covered by the sheet row.
  const inSheet = new Set(d.rows.map((r) => r[2 + d.keys.indexOf("ItemNumber")]).filter(Boolean))
  const extra = added.filter((a) => !a.fields.ItemNumber || !inSheet.has(a.fields.ItemNumber))
  const rows = [
    ...d.rows.map(([si, row, ...vals]) => ({ sheet: d.sheets[si].name, row, get: (k: FieldKey) => vals[d.keys.indexOf(k)] })),
    ...extra.map((a) => ({ sheet: a.sheet, row: 0, get: (k: FieldKey) => a.fields[k], added: { uid: a.uid, at: a.addedAt } })),
  ]
  const items = rows.map((r, id) => {
    const o = { id, row: r.row, sheet: r.sheet } as Item
    if ("added" in r) o.added = r.added
    FIELDS.forEach(([k]) => (o[k] = r.get(k) ?? ""))
    o.brand = brandName(o.sheet)
    const cls = o.ItemClassId ? o.ItemClassId.split(">").map((p) => p.trim()) : []
    const desc = `${o.ItemDescription} ${o.ShortDescription}`
    ;[o.kind, o.kindGuessed] = deriveKind(cls, desc)
    o.grade = deriveGrade(cls, desc)
    o.pack = derivePack(cls, desc)
    const hay = [...SEARCH_FIELDS.map((k) => o[k]), o.brand, derivedWords(o)].join(" ").toLowerCase()
    o.hay = hay
    o.hayCompact = normalize(hay)
    return o
  })

  const counts = new Map<string, number>()
  items.forEach((o) => o.ItemNumber && counts.set(o.ItemNumber, (counts.get(o.ItemNumber) ?? 0) + 1))
  items.forEach((o) => {
    const f: string[] = []
    if (!o.ItemNumber) f.push("No item number")
    else if ((counts.get(o.ItemNumber) ?? 0) > 1) f.push("Duplicate number")
    if (!o.ItemType || !o.ItemClassId) f.push("Missing setup")
    // A unit (DRUM, PAIL…) sitting in Item Type means the row's columns are shifted.
    if (o.ItemType && o.ItemType !== "Finished Goods" && o.ItemType.length < 8) f.push("Columns shifted")
    o.flags = f
  })
  return items
}

// ---------- Filters ----------

export type SortKey = "brand" | "best" | "num" | "desc"

export const FACETS = [
  { key: "kind", label: "Product type", get: (o: Item) => o.kind },
  { key: "grade", label: "Viscosity / grade", get: (o: Item) => o.grade },
  { key: "pack", label: "Pack size", get: (o: Item) => o.pack },
  { key: "brand", label: "Brand", get: (o: Item) => o.sheet },
  { key: "group", label: "Product group", get: (o: Item) => o.ProductGroupId },
  { key: "um", label: "Stock U/M", get: (o: Item) => o.StockUmId },
] as const

export type FacetKey = (typeof FACETS)[number]["key"]

export type Filters = { q: string; sort: SortKey; issuesOnly: boolean; addedOnly: boolean } & Record<FacetKey, string[]>

export const EMPTY_FILTERS: Filters = {
  q: "", sort: "brand", issuesOnly: false, addedOnly: false,
  kind: [], grade: [], pack: [], brand: [], group: [], um: [],
}

export const facetLabel = (key: FacetKey, v: string) => (key === "brand" ? brandName(v) : v)

export const activeFilterCount = (f: Filters) =>
  FACETS.reduce((n, { key }) => n + f[key].length, 0) + (f.issuesOnly ? 1 : 0) + (f.addedOnly ? 1 : 0)

export const tokenize = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

type Tok = readonly [raw: string, compact: string]
const toks = (q: string): Tok[] => tokenize(q).map((x) => [x, normalize(x)] as const)

// "15w40" also matches "15W-40" via the compact copy.
const hit = (o: Item, [raw, c]: Tok) => o.hay.includes(raw) || (c !== "" && o.hayCompact.includes(c))

function passesFacets(o: Item, f: Filters, skip?: FacetKey) {
  if (f.issuesOnly && !o.flags.length) return false
  if (f.addedOnly && !o.added) return false
  for (const { key, get } of FACETS) {
    if (key !== skip && f[key].length && !f[key].includes(get(o))) return false
  }
  return true
}

function score(o: Item, q: string, t: Tok[]) {
  const num = o.ItemNumber.toLowerCase()
  const desc = o.ItemDescription.toLowerCase()
  let s = 0
  if (num === q || o.BarcodeNumber === q) s += 1000
  else if (num.startsWith(q)) s += 500
  if (desc.startsWith(q)) s += 60
  else if (desc.includes(q)) s += 40
  for (const [raw] of t) {
    // Short fragments like "68" turn up inside lots of item numbers; only count longer ones.
    if (raw.length >= 4 && num.includes(raw)) s += 20
    if (new RegExp(`(^|[^a-z0-9])${raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(desc)) s += 10
    else if (desc.includes(raw)) s += 5
  }
  return s
}

function sortItems(res: Item[], f: Filters, t: Tok[]) {
  const q = f.q.trim().toLowerCase()
  const sc = t.length ? new Map(res.map((o) => [o.id, score(o, q, t)])) : null
  // Best match first when searching, otherwise the order rows have in the sheet.
  const relevance = (a: Item, b: Item) => (sc ? sc.get(b.id)! - sc.get(a.id)! : 0) || a.id - b.id
  if (f.sort === "num") res.sort((a, b) => a.ItemNumber.localeCompare(b.ItemNumber, undefined, { numeric: true }))
  else if (f.sort === "desc") res.sort((a, b) => a.ItemDescription.localeCompare(b.ItemDescription))
  else if (f.sort === "best") res.sort(relevance)
  else res.sort((a, b) => compareBrand(a.brand, b.brand) || relevance(a, b))
  return res
}

export interface SearchResult {
  items: Item[]
  /** True when no item matched every word and we are showing the closest matches instead. */
  partial: boolean
  /** Words that no item (within the current filters) contains. */
  missing: string[]
  /** Counts per facet value, given every other active filter. */
  facetCounts: Record<FacetKey, Map<string, number>>
}

export function search(items: Item[], f: Filters): SearchResult {
  const t = toks(f.q)
  // How many of the search words each item contains (indexed by item id).
  const hits = items.map((o) => t.reduce((n, tk) => n + (hit(o, tk) ? 1 : 0), 0))
  const inScope = items.filter((o) => passesFacets(o, f))

  let need = t.length
  let partial = false
  if (t.length >= 2 && !inScope.some((o) => hits[o.id] === need)) {
    // Nothing matches every word: fall back to items matching the most words.
    const best = Math.max(0, ...inScope.map((o) => hits[o.id]))
    if (best > 0) [need, partial] = [best, true]
  }
  const textOk = (o: Item) => hits[o.id] === need

  const facetCounts = {} as SearchResult["facetCounts"]
  for (const { key, get } of FACETS) {
    const m = new Map<string, number>()
    for (const o of items) {
      if (!textOk(o) || !passesFacets(o, f, key)) continue
      const v = get(o)
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    facetCounts[key] = m
  }

  const res = inScope.filter(textOk)
  const missing = res.length && !partial ? [] : t.filter((tk) => !inScope.some((o) => hit(o, tk))).map(([r]) => r)
  return { items: sortItems(res, f, t), partial, missing, facetCounts }
}

// ---------- "Did you mean" ----------

export function buildVocabulary(items: Item[]) {
  const m = new Map<string, number>()
  for (const o of items) for (const w of o.hay.split(/[^a-z0-9]+/)) if (w.length >= 3 && !/^\d+$/.test(w)) m.set(w, (m.get(w) ?? 0) + 1)
  return m
}

function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

/** Closest known word to a misspelled one, e.g. "hydrolic" → "hydraulic". */
export function suggestWord(word: string, vocab: Map<string, number>): string | null {
  if (word.length < 3 || /^\d+$/.test(word)) return null
  const max = word.length <= 4 ? 1 : 2
  let best: string | null = null
  let bestD = max + 1
  let bestN = 0
  for (const [w, n] of vocab) {
    const d = editDistance(word, w, max)
    if (d < bestD || (d === bestD && n > bestN)) [best, bestD, bestN] = [w, d, n]
  }
  return bestD <= max ? best : null
}

// ---------- URL state ----------

const URL_KEYS: Record<FacetKey, string> = { kind: "type", grade: "grade", pack: "pack", brand: "tab", group: "group", um: "um" }

export function filtersFromUrl(search: string): Filters {
  const p = new URLSearchParams(search)
  const f: Filters = { ...EMPTY_FILTERS, q: p.get("q") ?? "" }
  for (const { key } of FACETS) f[key] = p.getAll(URL_KEYS[key]).filter(Boolean)
  const sort = p.get("sort")
  if (sort === "num" || sort === "desc" || sort === "best") f.sort = sort
  f.issuesOnly = p.get("issues") === "1"
  f.addedOnly = p.get("added") === "1"
  return f
}

export function filtersToUrl(f: Filters, item?: string | null) {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set("q", f.q.trim())
  for (const { key } of FACETS) f[key].forEach((v) => p.append(URL_KEYS[key], v))
  if (f.sort !== "brand") p.set("sort", f.sort)
  if (f.issuesOnly) p.set("issues", "1")
  if (f.addedOnly) p.set("added", "1")
  if (item) p.set("item", item)
  const s = p.toString()
  return s ? `?${s}` : ""
}

// ---------- Copy to Excel ----------

const COPY_COLS: FieldKey[] = [
  "ItemNumber", "ItemDescription", "BarcodeNumber", "ShortDescription", "ItemType",
  "ItemClassId", "StockUmId", "ProductGroupId", "BillingUmId",
]

/** Tab-separated text that pastes straight into Excel. */
export function toTsv(items: Item[]) {
  const clean = (s: string) => s.replace(/[\t\n\r]/g, " ")
  const head = [...COPY_COLS.map((k) => FIELDS.find((f) => f[0] === k)![1]), "Tab", "Row"]
  return [head, ...items.map((o) => [...COPY_COLS.map((k) => clean(o[k])), o.sheet, o.added ? "added in app" : String(o.row)])]
    .map((r) => r.join("\t"))
    .join("\n")
}
