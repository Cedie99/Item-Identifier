// Usage: npm run copy-added-to-db
// One-time move of items added while the app saved to data/added-items.json into the online database
// (DATABASE_URL in .env.local). Items already in the database are skipped, so it is safe to run again.

import fs from "node:fs"
import path from "node:path"
import { neon } from "@neondatabase/serverless"

const root = path.join(import.meta.dirname, "..")
// Load DATABASE_URL from .env.local (Next.js does this for the app; plain Node scripts don't).
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local --yes` first.")
  process.exit(1)
}

const file = path.join(root, "data", "added-items.json")
const list: { uid: string; sheet: string; fields: Record<string, string>; addedAt: string }[] = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8"))
  : []

const sql = neon(process.env.DATABASE_URL)
await sql`CREATE TABLE IF NOT EXISTS added_items (
  uid uuid PRIMARY KEY,
  sheet text NOT NULL,
  fields jsonb NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  barcode text NOT NULL UNIQUE,
  item_number text
)`
await sql`CREATE UNIQUE INDEX IF NOT EXISTS added_items_item_number ON added_items (item_number) WHERE item_number IS NOT NULL`

let copied = 0
for (const a of list) {
  const rows = await sql`INSERT INTO added_items (uid, sheet, fields, added_at, barcode, item_number)
    VALUES (${a.uid}, ${a.sheet}, ${JSON.stringify(a.fields)}::jsonb, ${a.addedAt},
            ${a.fields.BarcodeNumber}, ${a.fields.ItemNumber?.toLowerCase() ?? null})
    ON CONFLICT DO NOTHING RETURNING uid`
  if (rows.length) copied++
  console.log(rows.length ? "copied " : "skipped", a.sheet, a.fields.BarcodeNumber, a.fields.ItemDescription)
}
const [{ n }] = await sql`SELECT count(*)::int AS n FROM added_items`
console.log(`Copied ${copied} of ${list.length}. The database now has ${n} added item(s).`)
