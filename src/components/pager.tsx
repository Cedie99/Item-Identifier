"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. 0-based. */
function pageList(page: number, count: number): (number | null)[] {
  const keep = new Set([0, count - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < count))
  // Near either end, show a few more so the row doesn't jump in width.
  if (page < 3) [1, 2, 3].forEach((p) => p < count && keep.add(p))
  if (page > count - 4) [count - 2, count - 3, count - 4].forEach((p) => p >= 0 && keep.add(p))
  const out: (number | null)[] = []
  ;[...keep].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i > 0 && p - arr[i - 1] > 1) out.push(p - arr[i - 1] === 2 ? p - 1 : null)
    out.push(p)
  })
  return out
}

/** Previous / page numbers / next, with "1–50 of 1,234 items". */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const count = Math.ceil(total / pageSize)
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5">
      <p className="text-sm text-muted-foreground tabular-nums">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} items
      </p>
      {count > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeftIcon /> <span className="max-sm:sr-only">Prev</span>
          </Button>
          {/* Phones: just "Page 2 of 8" between the arrows; the full number row is too wide. */}
          <span className="px-2 text-sm tabular-nums sm:hidden">
            Page {page + 1} of {count}
          </span>
          {pageList(page, count).map((p, i) =>
            p == null ? (
              <span key={`gap${i}`} className="px-1 text-muted-foreground max-sm:hidden" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="sm"
                className="min-w-8 px-2 tabular-nums max-sm:hidden"
                aria-label={`Page ${p + 1}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPage(p)}
              >
                {p + 1}
              </Button>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= count - 1} onClick={() => onPage(page + 1)} aria-label="Next page">
            <span className="max-sm:sr-only">Next</span> <ChevronRightIcon />
          </Button>
        </div>
      )}
    </nav>
  )
}
