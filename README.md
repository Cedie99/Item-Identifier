# Item Master Finder

Search and filter every item in the item master tracker (all brand tabs) in one place.
Built with Next.js, TypeScript and shadcn/ui. It never writes to the Excel file or the Google Sheet.

## Run it

```bash
npm install
npm run dev        # open http://localhost:3000
```

## Update the data

1. In Google Sheets, open the tracker and choose **File → Download → Microsoft Excel (.xlsx)**.
2. Import it:

```bash
npm run import-data -- "C:\Users\<you>\Downloads\Item Master Final ... .xlsx"
```

This rewrites `public/data/items.json`, which the app loads. Anyone using the app can also click
**Load newer Excel file** to view a fresh download in their own browser without re-importing.

## Finding items

- **Search box** matches every word against item no., barcode, description, class, brand and unit.
  It understands shorthand both ways: `drum` finds D200, `pail 20` finds P20, `hydraulic` finds AW 68, `15w40` finds 15W-40.
  Typos are corrected automatically ("hydrolic" → hydraulic). If nothing matches every word, the closest matches are shown.
- Click the grey type / grade / pack text under any item to see only items like it (remove it again from the chip above the list).
- Keyboard: `/` to search, ↑ ↓ to move, Enter to open, ↑ ↓ inside an item to step through results.
- The address bar keeps your search, filters and open item, so you can bookmark or share a link.

Product type, grade and pack come from the Item Class column. For rows without one they are guessed
from the description (marked with * in the item panel).

## Brands

A brand is a tab of the Google Sheet (the tab names along the bottom), without the "Item Master" prefix.
Brands appear as tabs above the list, A–Z, each with its item count:

- **All brands** shows a card per brand (with its main product types); click one to open its tab.
- Scroll the tab strip with the arrows, use ← → on the keyboard, or pick from the **N brands** menu, which you can search.
- Searching or filtering inside a brand tab stays in that brand. If nothing matches there, a button shows matches in other brands.
  On the All brands tab, a search covers every brand and the tabs shrink to the brands that have matches.

## Adding items

Click **Add item** (or **Add to <brand>** inside a brand tab, or **Add similar item** on an existing item to copy its details and inventory settings).
Choose **Existing brand**, or **New brand** to create one: type the name of the Google Sheet tab it will go in, and it gets its own tab.
Only Description and Barcode number are required (the barcode can be generated, see below). Item number is optional (if given, it must be new). With no brand chosen, the item goes in an "Unassigned" tab.

Added items are saved by the app server in `data/added-items.json`, so everyone using the same running app sees them,
marked "Added in app". They are **not** written to the Google Sheet: use the "Added in app only" filter and
**Copy for Excel** to paste them into the sheet. Once a newer sheet with that item number is imported, the sheet row
takes over and the added copy is hidden automatically. Added items can be removed from their item panel.

This needs the app to run as a server (`npm run dev` or `npm run build && npm start`); it can't save on a static host
or on Vercel, whose file system is read-only.

## Barcode numbers

Barcodes have 9 digits: **brand code (3) + item number in the brand (4) + unit code (2)**, e.g. I-LUBE `112` + `0003` + `06` = 112000306.
The official codes come from the **Identifier** workbook, kept in `src/lib/identifier.json`. When it changes, re-import it:

```bash
npm run import-identifier -- "C:\Users\<you>\Downloads\Identifier.xlsx"
```

- **Brand code**: the code most of the brand's existing barcodes use (some barcodes are messy; the majority wins, e.g.
  V-PLUS uses 110 on most items and 117 on one, so 110). A brand with no barcodes yet uses its Identifier code
  (e.g. POWERLUBE 063). A brand in neither gets the next number not used anywhere, in the barcodes or the Identifier
  (now 121), so a code already in the system is never reused even if it's missing from the Identifier. Add the new brand to the Identifier.
- **Item number**: one more than the highest already used with that brand code, counting items added in the app.
- **Unit code** = the Stock U/M: Bottle 01, Box 02, Pail 03, Drum 04, G 05, Gal 06, Car 07, Cup 08, Can 09, Kg 10, Sac 11,
  Tub 12, IBC 13, LT 14, Pc 15, Unit 16. The form takes it from Stock U/M, or from the pack size in the description
  (D200 → Drum, P20 → Pail, 12X1 → Bottle, P15KG → Kg). If Stock U/M was left empty, it is filled in from the unit.

In Add item, **Generate** builds the barcode (the final number is assigned by the server when saving, so two people can't get the same one);
**Type it** lets you enter one by hand. A barcode already used by another item is refused. The rule lives in `src/lib/barcode.ts`.

## Where things are

- `src/lib/parse-workbook.ts` reads the workbook tabs (used by the import script and the in-app loader)
- `src/lib/barcode.ts` and `identifier.json` hold the barcode rule and the Identifier codes (`scripts/import-identifier.ts` refreshes them)
- `src/lib/items.ts` handles search, filters, derived type/grade/pack, spelling suggestions, URL state and copy-to-Excel
- `src/app/api/items/route.ts` and `src/lib/added-store.ts` save, list and remove added items
- `src/components/add-item-sheet.tsx` is the Add item form
- `src/components/brand-tabs.tsx`, `brand-grid.tsx` and `brand-picker.tsx` are the brand tabs, the All brands cards and the brand list
- `src/components/item-finder.tsx` is the main screen; `facet-panel.tsx`, `item-table.tsx` and `item-sheet.tsx` show filters, results and details

Note: `public/data/items.json` holds company item data. Keep the repo private.
