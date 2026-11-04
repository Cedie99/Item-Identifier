// Server-only storage for items people add in the app. The Google Sheet itself is never touched.
//
// Where they're kept:
//   - DATABASE_URL set (the Vercel deployment, Neon Postgres) → table "added_items"
//   - otherwise (running on a PC with `npm run dev`)        → data/added-items.json
//
// Either way, barcodes and item numbers are unique: the database enforces it, and a generated barcode
// that someone else took a moment earlier is simply renumbered and saved again.

import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { neon, type NeonQueryFunction } from "@neondatabase/serverless"
import { FIELDS, type Dataset, type FieldKey } from "./parse-workbook"
import type { AddedItem } from "./items"
import { brandCode, composeBarcode, nextSequence, UNIT_CODES, unitCodeLabel, type BarcodeRow } from "./barcode"

const SHEET_DATA = path.join(process.cwd(), "public", "data", "items.json")
const KEYS = new Set<string>(FIELDS.map(([k]) => k))
const MAX_LEN = 500

export class InputError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** Thrown by a store when the barcode or item number is already taken. */
class TakenError extends Error {}

interface Store {
  list(): Promise<AddedItem[]>
  insert(item: AddedItem): Promise<void>
  remove(uid: string): Promise<boolean>
}

// ---------- File store (local PC) ----------

const DIR = path.join(process.cwd(), "data")
const FILE = path.join(DIR, "added-items.json")

// One change at a time, so two people saving together can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

async function readFile(): Promise<AddedItem[]> {
  try {
    const list = JSON.parse(await fs.readFile(FILE, "utf8"))
    return Array.isArray(list) ? list : []
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return []
    throw e
  }
}

async function writeFile(list: AddedItem[]) {
  await fs.mkdir(DIR, { recursive: true })
  // Write to a temp file first so a crash never leaves half a file behind.
  const tmp = `${FILE}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(list, null, 2), "utf8")
  await fs.rename(tmp, FILE)
}

const fileStore: Store = {
  list: readFile,
  insert: (item) =>
    exclusive(async () => {
      const list = await readFile()
      const num = item.fields.ItemNumber?.toLowerCase()
      if (list.some((a) => a.fields.BarcodeNumber === item.fields.BarcodeNumber || (num && a.fields.ItemNumber?.toLowerCase() === num)))
        throw new TakenError()
      await writeFile([...list, item])
    }),
  remove: (uid) =>
    exclusive(async () => {
      const list = await readFile()
      const next = list.filter((a) => a.uid !== uid)
      if (next.length === list.length) return false
      await writeFile(next)
      return true
    }),
}

// ---------- Database store (Vercel, Neon Postgres) ----------

let sql: NeonQueryFunction<false, false> | null = null
let ready: Promise<void> | null = null

function db() {
  sql ??= neon(process.env.DATABASE_URL!)
  // Create the table on first use; unique indexes are what keep barcodes and item numbers unique.
  ready ??= (async () => {
    await sql!`CREATE TABLE IF NOT EXISTS added_items (
      uid uuid PRIMARY KEY,
      sheet text NOT NULL,
      fields jsonb NOT NULL,
      added_at timestamptz NOT NULL DEFAULT now(),
      barcode text NOT NULL UNIQUE,
      item_number text
    )`
    await sql!`CREATE UNIQUE INDEX IF NOT EXISTS added_items_item_number ON added_items (item_number) WHERE item_number IS NOT NULL`
  })().catch((e) => {
    ready = null
    throw e
  })
  return { sql: sql!, ready }
}

const dbStore: Store = {
  async list() {
    const { sql, ready } = db()
    await ready
    const rows = await sql`SELECT uid, sheet, fields, added_at FROM added_items ORDER BY added_at`
    return rows.map((r) => ({
      uid: String(r.uid),
      sheet: String(r.sheet),
      fields: r.fields as AddedItem["fields"],
      addedAt: new Date(r.added_at as string).toISOString(),
    }))
  },
  async insert(item) {
    const { sql, ready } = db()
    await ready
    try {
      await sql`INSERT INTO added_items (uid, sheet, fields, added_at, barcode, item_number)
        VALUES (${item.uid}, ${item.sheet}, ${JSON.stringify(item.fields)}::jsonb, ${item.addedAt},
                ${item.fields.BarcodeNumber}, ${item.fields.ItemNumber?.toLowerCase() ?? null})`
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw new TakenError() // unique violation
      throw e
    }
  },
  async remove(uid) {
    const { sql, ready } = db()
    await ready
    const rows = await sql`DELETE FROM added_items WHERE uid = ${uid} RETURNING uid`
    return rows.length > 0
  },
}

const store = (): Store => (process.env.DATABASE_URL ? dbStore : fileStore)

export const storageKind = () => (process.env.DATABASE_URL ? "database" : "file")

// ---------- Shared logic ----------

export const readAdded = () => store().list()

/** Item numbers and barcodes already in the sheet copy shipped with the app. */
async function sheetData(): Promise<{ numbers: Set<string>; barcodes: BarcodeRow[] }> {
  try {
    const d: Dataset = JSON.parse(await fs.readFile(SHEET_DATA, "utf8"))
    const ni = 2 + d.keys.indexOf("ItemNumber")
    const bi = 2 + d.keys.indexOf("BarcodeNumber")
    return {
      numbers: new Set(d.rows.map((r) => String(r[ni] ?? "").trim().toLowerCase()).filter(Boolean)),
      barcodes: d.rows.map((r) => ({ sheet: d.sheets[r[0]].name, barcode: String(r[bi] ?? "").trim() })),
    }
  } catch {
    return { numbers: new Set(), barcodes: [] }
  }
}

export interface AddInput {
  sheet: string
  fields: Partial<Record<FieldKey, string>>
  /** Unit code (01 Bottle, 04 Drum …) when the barcode should be generated by the numbering rule. */
  autoBarcodeUnit?: string
}

/** Checks and cleans what the browser sent. */
export function parseInput(body: unknown): AddInput {
  if (!body || typeof body !== "object") throw new InputError("Send the item as JSON.")
  const { sheet, fields, autoBarcodeUnit } = body as { sheet?: unknown; fields?: unknown; autoBarcodeUnit?: unknown }
  if (autoBarcodeUnit != null && !UNIT_CODES.some((c) => c.code === autoBarcodeUnit)) throw new InputError("Unknown unit code.")
  if (sheet != null && typeof sheet !== "string") throw new InputError("Brand must be text.")
  if (sheet && sheet.length > 100) throw new InputError("Brand name is too long.")
  if (!fields || typeof fields !== "object") throw new InputError("Item details are missing.")

  const clean: Partial<Record<FieldKey, string>> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!KEYS.has(k) || v == null) continue
    if (typeof v !== "string") throw new InputError(`${k} must be text.`)
    const t = v.trim()
    if (t.length > MAX_LEN) throw new InputError(`${k} is too long.`)
    if (t) clean[k as FieldKey] = t
  }
  const brand = sheet?.trim() || "Unassigned"
  if (!clean.ItemDescription) throw new InputError("Description is required.")
  if (autoBarcodeUnit && brand === "Unassigned") throw new InputError("Choose a brand to generate the barcode, or type one in.")
  if (!clean.BarcodeNumber && !autoBarcodeUnit) throw new InputError("Barcode number is required.")
  return { sheet: brand, fields: clean, autoBarcodeUnit: (autoBarcodeUnit as string | undefined) ?? undefined }
}

export async function addItem({ autoBarcodeUnit, ...input }: AddInput): Promise<AddedItem> {
  const sheet = await sheetData()
  // A generated barcode can be taken by someone saving at the same moment; renumber and try again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const list = await store().list()
    const used: BarcodeRow[] = [...sheet.barcodes, ...list.map((a) => ({ sheet: a.sheet, barcode: a.fields.BarcodeNumber ?? "" }))]
    const fields = { ...input.fields }

    if (autoBarcodeUnit) {
      const code = brandCode(used, input.sheet).code
      fields.BarcodeNumber = composeBarcode(code, nextSequence(used, code), autoBarcodeUnit)
      // The unit code is the Stock U/M, so fill it in when it was left empty (04 → DRUM).
      fields.StockUmId ||= unitCodeLabel(autoBarcodeUnit)?.toUpperCase()
    }
    const bc = fields.BarcodeNumber!
    if (used.some((r) => r.barcode === bc)) throw new InputError(`Barcode ${bc} is already used by another item.`, 409)

    // Item number is optional, but when given it must be new.
    const num = fields.ItemNumber?.toLowerCase()
    if (num && sheet.numbers.has(num)) throw new InputError(`Item number ${fields.ItemNumber} is already in the sheet.`, 409)
    if (num && list.some((a) => a.fields.ItemNumber?.toLowerCase() === num))
      throw new InputError(`Item number ${fields.ItemNumber} was already added in the app.`, 409)

    const item: AddedItem = { uid: randomUUID(), sheet: input.sheet, fields, addedAt: new Date().toISOString() }
    try {
      await store().insert(item)
      return item
    } catch (e) {
      if (!(e instanceof TakenError)) throw e
      if (!autoBarcodeUnit) throw new InputError(`Barcode ${bc} or item number ${fields.ItemNumber ?? ""} was just used by someone else.`, 409)
    }
  }
  throw new InputError("Several people are adding to this brand right now. Please try again.", 409)
}

export async function removeItem(uid: string): Promise<void> {
  if (!(await store().remove(uid))) throw new InputError("That item is no longer in the added list.", 404)
}
