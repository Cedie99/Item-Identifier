// Usage: npm run import-data -- "C:\path\to\Item Master ... .xlsx"
// Reads the tracker (read-only) and writes public/data/items.json for the app.

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { parseWorkbook } from "../src/lib/parse-workbook.ts"

const require = createRequire(import.meta.url)
const XLSX = require("xlsx")

const src = process.argv[2]
if (!src || !fs.existsSync(src)) {
  console.error("Give the path to the Excel file, e.g.\n  npm run import-data -- \"C:\\Users\\me\\Downloads\\Item Master.xlsx\"")
  process.exit(1)
}

const wb = XLSX.read(fs.readFileSync(src), { type: "buffer" })
const data = parseWorkbook(XLSX, wb, {
  file: path.basename(src),
  asOf: fs.statSync(src).mtime.toISOString().slice(0, 10),
})

const out = path.join(import.meta.dirname, "..", "public", "data", "items.json")
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(data))
console.log(`Imported ${data.rows.length} items from ${data.sheets.length} tabs -> ${path.relative(process.cwd(), out)}`)
