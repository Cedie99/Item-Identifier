import { Fragment } from "react"

/** Marks every occurrence of the search words inside `text`. */
export function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!text || !words.length) return <>{text}</>
  const low = text.toLowerCase()
  const on = new Array<boolean>(text.length).fill(false)
  for (const w of words) {
    let i = low.indexOf(w)
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) on[k] = true
      i = low.indexOf(w, i + w.length)
    }
  }
  const parts: { s: string; m: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.m === on[i]) last.s += text[i]
    else parts.push({ s: text[i], m: on[i] })
  }
  return (
    <>
      {parts.map((p, i) =>
        p.m ? (
          <mark key={i} className="rounded-[2px] bg-highlight px-px text-highlight-foreground">
            {p.s}
          </mark>
        ) : (
          <Fragment key={i}>{p.s}</Fragment>
        ),
      )}
    </>
  )
}
