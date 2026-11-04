// Reads every tab of the item master workbook into one compact table.
// Shared by the import script (Node) and the "Load newer Excel file" button (browser).
// It only reads; it never writes to the workbook.

import type * as XLSXType from "xlsx"

export const FIELDS = [
  ["ItemNumber", "Item Number"],
  ["ItemDescription", "Description"],
  ["BarcodeNumber", "Barcode Number"],
  ["ShortDescription", "Short Description"],
  ["ItemType", "Item Type"],
  ["ItemClassId", "Item Class"],
  ["StockUmId", "Stock U/M"],
  ["ProductGroupId", "Product Group"],
  ["BillingUmId", "Billing U/M"],
  ["HoldCodeId", "Hold Code"],
  ["DateLaunched", "Date Launched"],
  ["RecordOwner", "Record Owner"],
  ["SpecificationTemplateId", "Specification Template"],
  ["LocationTypeId", "Location Type"],
  ["PackUmId", "Default Issue U/M"],
  ["PickingOrder", "Picking Order"],
  ["CostingMethod", "Costing Method"],
  ["MultipleUmBalances", "Multiple U/M Balances"],
  ["ControlledItem", "Controlled Item"],
  ["PalletControl", "Pallet Control"],
  ["FreezeAbc", "Freeze ABC"],
  ["LotControl", "Lot Control"],
  ["LotNumberUnique", "Serial Control"],
  ["SingleLotAllocation", "Single Lot Allocation"],
  ["AutoGenerateLotNumber", "Auto Generate Lot Number"],
  ["ExpiryDateRequired", "Expiry Date Required"],
  ["ExpiryDateRule", "Expiry Date Rule"],
  ["ShelfLife", "Shelf Life"],
  ["AllowedForStockReplenishment", "Allowed For Stock Replenishment"],
  ["SupplierWarrantyPeriodType", "Supplier Warranty Period Type"],
  ["SupplierWarrantyDuration", "Supplier Warranty Duration"],
  ["UndershipTolerance", "Undership Tolerance"],
  ["OvershipTolerance", "Overship Tolerance"],
  ["PutAwayRuleId", "Put-Away Rule"],
  ["ParallelQtyOnHand", "Parallel Qty on Hand"],
  ["SpecificGravity", "Standard Specific Gravity"],
  ["NetUnitWeight", "Net Unit Weight"],
  ["NetUnitVolume", "Net Unit Volume"],
  ["Remarks", "Remarks"],
] as const

export type FieldKey = (typeof FIELDS)[number][0]

export const FIELD_LABEL = Object.fromEntries(FIELDS) as Record<FieldKey, string>

const KEYS = FIELDS.map((f) => f[0]) as FieldKey[]
const KEY_BY_LABEL = new Map(FIELDS.map(([k, l]) => [l.toLowerCase(), k]))
const ERROR_VALUES = new Set(["#N/A", "#ERROR!", "#REF!", "#VALUE!", "#NAME?", "#DIV/0!"])

/** A row is [sheetIndex, excelRowNumber, ...values in KEYS order]. */
export type CompactRow = [number, number, ...string[]]

export interface Dataset {
  keys: FieldKey[]
  sheets: { name: string; count: number }[]
  rows: CompactRow[]
  source: { file: string; asOf: string; uploaded?: boolean }
}

export function parseWorkbook(
  XLSX: typeof XLSXType,
  wb: XLSXType.WorkBook,
  source: Dataset["source"],
): Dataset {
  const sheets: Dataset["sheets"] = []
  const rows: CompactRow[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws || !ws["!ref"]) continue
    const firstRow = XLSX.utils.decode_range(ws["!ref"]).s.r
    const data = XLSX.utils.sheet_to_json<(string | null)[]>(ws, {
      header: 1,
      defval: null,
      blankrows: true,
      raw: false,
    })

    // Most tabs have a system-key header row (ItemNumber…) then a label row (Item Number…).
    // A few only have the label row. Accept either.
    let headerAt = -1
    let mode: "key" | "label" = "key"
    for (let i = 0; i < Math.min(data.length, 15); i++) {
      const cells = (data[i] ?? []).map((c) => (c == null ? "" : String(c).trim()))
      if (cells.includes("ItemNumber")) { headerAt = i; mode = "key"; break }
      if (cells.includes("Item Number")) { headerAt = i; mode = "label"; break }
    }
    if (headerAt < 0) continue

    const colToField = (data[headerAt] ?? []).map((c) => {
      const s = c == null ? "" : String(c).trim()
      const key = mode === "key" ? (KEYS.includes(s as FieldKey) ? (s as FieldKey) : undefined) : KEY_BY_LABEL.get(s.toLowerCase())
      return key ? KEYS.indexOf(key) : -1
    })

    const sheetIndex = sheets.length
    let count = 0
    for (let j = headerAt + 1; j < data.length; j++) {
      const r = data[j]
      if (!r) continue
      const vals: string[] = KEYS.map(() => "")
      let any = false
      colToField.forEach((fi, c) => {
        if (fi < 0) return
        const raw = r[c]
        if (raw == null) return
        const v = String(raw).trim()
        if (!v || ERROR_VALUES.has(v)) return
        vals[fi] = v
        any = true
      })
      if (!any) continue
      if (vals[0] === "Item Number" || vals[0] === "ItemNumber" || vals[1] === "Description") continue
      if (!vals[0] && !vals[1]) continue
      rows.push([sheetIndex, firstRow + j + 1, ...vals])
      count++
    }
    sheets.push({ name: name.trim(), count })
  }

  return { keys: KEYS, sheets, rows, source }
}
