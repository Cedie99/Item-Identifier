/** ERIC ERP Support Ticketing System (Jotform). Only this form is read. */
const FORM_ID = "250700730456450"

/** Question ids on that form. */
const Q = {
  ticket: "6",
  itemType: "84",
  description: "90",
  brand: "86",
  stockUm: "103",
  category: "99",
  productFamily: "95",
  grade: "96",
  productType: "97",
  industry: "98",
  packaging: "100",
  packagingSize: "101",
} as const

/** Item class parts, in ERP order. */
export const CLASS_PARTS = [
  ["category", "Category"],
  ["productFamily", "Product Family"],
  ["grade", "Grade"],
  ["productType", "Product Type"],
  ["industry", "Industry"],
  ["packaging", "Packaging"],
  ["packagingSize", "Packaging Size"],
] as const

export type ClassPart = (typeof CLASS_PARTS)[number][0]

export interface Ticket {
  ticket: string
  itemType: string
  description: string
  brand: string
  stockUm: string
  parts: Record<ClassPart, string>
  /** Parts joined in order, as the ERP stores it: "LUBES > SF > SAE 20W-50 > …". */
  itemClass: string
  missing: string[]
}

export class TicketError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

/** "3421", "erp 3421", "ERP-003421" → "ERP-003421". */
export function normalizeTicket(input: string): string | null {
  const digits = input.trim().match(/^(?:ERP)?[\s-]*0*(\d{1,6})$/i)?.[1]
  return digits ? `ERP-${digits.padStart(6, "0")}` : null
}

type Answers = Record<string, { answer?: unknown }>

const text = (a: Answers, q: string) => {
  const v = a[q]?.answer
  return typeof v === "string" ? v.trim() : ""
}

export async function fetchTicket(input: string): Promise<Ticket> {
  const ticket = normalizeTicket(input)
  if (!ticket) throw new TicketError("Enter a ticket number like ERP-003421.")
  const key = process.env.JOTFORM_API_KEY
  if (!key) throw new TicketError("JOTFORM_API_KEY is not set on the server.", 500)

  const url = new URL(`https://api.jotform.com/form/${FORM_ID}/submissions`)
  url.searchParams.set("filter", JSON.stringify({ [`q${Q.ticket}:eq`]: ticket }))
  url.searchParams.set("limit", "5")
  const res = await fetch(url, { headers: { APIKEY: key }, cache: "no-store" })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.responseCode !== 200) throw new TicketError(`Jotform error: ${body?.message ?? res.status}`, 502)

  const sub = (body.content as { status: string; answers: Answers }[]).find((s) => s.status !== "DELETED")
  if (!sub) throw new TicketError(`Ticket ${ticket} was not found.`, 404)
  const a = sub.answers

  const itemType = text(a, Q.itemType)
  if (itemType !== "Finished Goods")
    throw new TicketError(`Ticket ${ticket} is ${itemType ? `“${itemType}”` : "not a new item request"}, not Finished Goods.`, 422)

  const parts = Object.fromEntries(CLASS_PARTS.map(([k]) => [k, text(a, Q[k])])) as Record<ClassPart, string>
  return {
    ticket,
    itemType,
    description: text(a, Q.description),
    brand: text(a, Q.brand),
    stockUm: text(a, Q.stockUm),
    parts,
    itemClass: CLASS_PARTS.map(([k]) => parts[k]).join(" > "),
    missing: CLASS_PARTS.filter(([k]) => !parts[k]).map(([, label]) => label),
  }
}
