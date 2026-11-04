// Usage: npm run import-identifier -- "C:\path\to\Identifier.xlsx"
// Reads the barcode Identifier workbook (read-only) and writes src/lib/identifier.json:
//   - unit codes (last 2 digits of a barcode): Bottle 01, Box 02, Pail 03, Drum 04 …
//   - brand codes (first 3 digits): Platinum 001, Comet 002 … plus unused numbers kept for new brands.

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const XLSX = require("xlsx")

const src = process.argv[2]
if (!src || !fs.existsSync(src)) {
  console.error("Give the path to the Identifier Excel file, e.g.\n  npm run import-identifier -- \"C:\\Users\\me\\Downloads\\Identifier.xlsx\"")
  process.exit(1)
}

const wb = XLSX.read(fs.readFileSync(src), { type: "buffer" })
const ws = wb.Sheets["Identifier"] ?? wb.Sheets[wb.SheetNames[0]]
const rows: string[][] = XLSX.utils
  .sheet_to_json(ws, { header: 1, defval: "", raw: false, blankrows: false })
  .map((r: unknown[]) => r.map((c) => String(c ?? "").trim()))

// Header row looks like: ["", "Code", "", "Brand", "Code"]
const h = rows.findIndex((r) => r.some((c) => /^brand$/i.test(c)) && r.some((c) => /^code$/i.test(c)))
if (h < 0) {
  console.error("Could not find the header row with 'Brand' and 'Code'.")
  process.exit(1)
}
const head = rows[h]
const unitCodeCol = head.findIndex((c) => /^code$/i.test(c))
const unitNameCol = unitCodeCol - 1
const brandNameCol = head.findIndex((c) => /^brand$/i.test(c))
const brandCodeCol = head.findIndex((c, i) => i > brandNameCol && /^code$/i.test(c))

const units: { code: string; label: string }[] = []
const brands: { name: string; code: string }[] = []
const free: string[] = []
for (const r of rows.slice(h + 1)) {
  const [uName, uCode] = [r[unitNameCol], r[unitCodeCol]]
  if (uName && /^\d{1,2}$/.test(uCode)) units.push({ label: uName, code: uCode.padStart(2, "0") })
  const [bName, bCode] = [r[brandNameCol], r[brandCodeCol]]
  if (!/^\d{1,3}$/.test(bCode ?? "")) continue
  if (bName) brands.push({ name: bName, code: bCode.padStart(3, "0") })
  else free.push(bCode.padStart(3, "0"))
}

const out = path.join(import.meta.dirname, "..", "src", "lib", "identifier.json")
const data = {
  source: { file: path.basename(src), asOf: fs.statSync(src).mtime.toISOString().slice(0, 10) },
  units,
  brands,
  free,
}
fs.writeFileSync(out, JSON.stringify(data, null, 2) + "\n")
console.log(`Imported ${units.length} unit codes and ${brands.length} brand codes (${free.length} free) -> ${path.relative(process.cwd(), out)}`)
