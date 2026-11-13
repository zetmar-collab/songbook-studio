// Normalizacja tekstu do wyszukiwania: małe litery, bez znaków diakrytycznych,
// z ręcznym składaniem liter, które Unicode NFD nie rozkłada (ł, ø, đ, ß, …).

const SPECIAL: Record<string, string> = {
  ł: 'l',
  đ: 'd',
  ð: 'd',
  ø: 'o',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ı: 'i',
  þ: 'th'
}

export function normalizeChar(ch: string): string {
  const lower = ch.toLowerCase()
  const special = SPECIAL[lower]
  if (special !== undefined) return special
  return lower.normalize('NFD').replace(/\p{M}/gu, '')
}

/** Tekst do porównań: znormalizowany, z pojedynczymi spacjami. */
export function normalizeText(s: string): string {
  let out = ''
  for (const ch of s) out += normalizeChar(ch)
  return out.replace(/\s+/g, ' ').trim()
}

/** Rozbija zapytanie na znormalizowane tokeny (maks. 8). */
export function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter(Boolean)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') || t) // „rzeka", [Am] → rzeka, am
    .slice(0, 8)
}

interface Normalized {
  n: string
  /** map[i] = indeks (UTF-16) znaku oryginału, z którego powstał znak n[i]. */
  map: number[]
  /** lens[i] = długość (UTF-16) znaku oryginału. */
  lens: number[]
}

function buildNormalized(s: string): Normalized {
  let n = ''
  const map: number[] = []
  const lens: number[] = []
  let idx = 0
  for (const ch of s) {
    const nc = normalizeChar(ch)
    for (let k = 0; k < nc.length; k++) {
      map.push(idx)
      lens.push(ch.length)
    }
    n += nc
    idx += ch.length
  }
  return { n, map, lens }
}

/** Zakresy [od, do) w ORYGINALNYM tekście, które pasują do któregokolwiek tokenu. */
export function highlightRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (!text || tokens.length === 0) return []
  const { n, map, lens } = buildNormalized(text)
  const raw: Array<[number, number]> = []
  for (const token of tokens) {
    if (!token) continue
    let from = 0
    for (;;) {
      const at = n.indexOf(token, from)
      if (at < 0) break
      const last = at + token.length - 1
      raw.push([map[at], map[last] + lens[last]])
      from = at + token.length
    }
  }
  raw.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const r of raw) {
    const prev = merged[merged.length - 1]
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

export interface Snippet {
  text: string
  ranges: Array<[number, number]>
}

/** Krótki fragment linii zawierającej pierwsze trafienie (do listy wyników). */
export function makeSnippet(text: string, tokens: string[], radius = 36): Snippet | null {
  if (!text || tokens.length === 0) return null
  for (const line of text.split(/\r?\n/)) {
    const ranges = highlightRanges(line, tokens)
    if (ranges.length === 0) continue
    const start = Math.max(0, ranges[0][0] - radius)
    const end = Math.min(line.length, ranges[0][1] + radius)
    const prefix = start > 0 ? '…' : ''
    const suffix = end < line.length ? '…' : ''
    const slice = line.slice(start, end)
    const shifted = highlightRanges(slice, tokens).map(
      ([a, b]) => [a + prefix.length, b + prefix.length] as [number, number]
    )
    return { text: prefix + slice + suffix, ranges: shifted }
  }
  return null
}
