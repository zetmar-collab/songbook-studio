// Akordy w nawiasach kwadratowych: rozpoznawanie, transpozycja z zachowaniem spójnego
// zapisu (krzyżyki albo bemole), widok „akordy nad tekstem", sugestia kapodastra.
//
// Nawiasy kwadratowe służą też do etykiet sekcji ([Refren], [Bridge]) — dlatego
// transponowane i usuwane są WYŁĄCZNIE tokeny, które są prawdziwymi akordami.

export type Spelling = 'sharp' | 'flat'

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0
}

/** Konwencjonalne nazwy tonacji dla każdego stopnia chromatycznego. */
export const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
export const MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
export const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS]

const CHORD_RE =
  /^([A-G][#b]?)((?:maj|min|dim|aug|sus|add|[mM+°ø-]|\d|[#b]|[()]|,|\/\d+)*)(?:\/([A-G][#b]?))?$/

const BRACKET_RE = /\[([^[\]\n]*)\]/g

export interface ParsedChord {
  root: string
  suffix: string
  bass: string | null
}

export function parseChord(token: string): ParsedChord | null {
  const m = CHORD_RE.exec(token.trim())
  if (!m) return null
  return { root: m[1], suffix: m[2], bass: m[3] ?? null }
}

export function isChord(token: string): boolean {
  return parseChord(token) !== null
}

function noteName(pitch: number, spelling: Spelling): string {
  const i = ((pitch % 12) + 12) % 12
  return spelling === 'flat' ? FLAT_NAMES[i] : SHARP_NAMES[i]
}

export function transposeChord(token: string, semitones: number, spelling: Spelling): string {
  const p = parseChord(token)
  if (!p) return token
  const root = noteName(PITCH[p.root] + semitones, spelling)
  const bass = p.bass ? '/' + noteName(PITCH[p.bass] + semitones, spelling) : ''
  return root + p.suffix + bass
}

// ---------- Tonacje ----------

export interface ParsedKey {
  pitch: number
  minor: boolean
  /** Reszta zapisu po nazwie tonacji (np. " major"), zachowywana przy transpozycji. */
  rest: string
  /** Fragment oznaczający moll tak, jak wpisał go użytkownik ("m", "min", …). */
  minorText: string
  accidental: '' | '#' | 'b'
  letter: string
}

export function parseKey(key: string): ParsedKey | null {
  const m = /^\s*([A-G])([#b]?)(minor|min|m(?!aj)|-)?(.*)$/.exec(key)
  if (!m) return null
  const rest = m[4]
  if (rest !== '' && !/^\s/.test(rest)) return null // np. „Dorian", „Cadd9"
  const pitch = PITCH[m[1] + m[2]]
  if (pitch === undefined) return null
  return {
    pitch,
    minor: !!m[3],
    rest,
    minorText: m[3] ?? '',
    accidental: m[2] as '' | '#' | 'b',
    letter: m[1]
  }
}

/** Zapis tonacji wskazuje krzyżyki/bemole; dla C-dur i a-moll zwraca null. */
export function spellingForKey(key: string): Spelling | null {
  const k = parseKey(key)
  if (!k) return null
  if (k.accidental === 'b') return 'flat'
  if (k.accidental === '#') return 'sharp'
  if (k.minor) {
    if ('DGCF'.includes(k.letter)) return 'flat'
    if ('EB'.includes(k.letter)) return 'sharp'
    return null // a-moll
  }
  if (k.letter === 'F') return 'flat'
  if ('GDAEB'.includes(k.letter)) return 'sharp'
  return null // C-dur
}

export function conventionalKey(pitch: number, minor: boolean): string {
  const i = ((pitch % 12) + 12) % 12
  return minor ? MINOR_KEYS[i] : MAJOR_KEYS[i]
}

export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key)
  if (!k) return key
  const name = conventionalKey(k.pitch + semitones, k.minor)
  const root = k.minor ? name.slice(0, -1) : name
  return root + k.minorText + k.rest
}

/** Najkrótsza droga w półtonach (−5…+6) między dwiema tonacjami; null, gdy zapis nie jest tonacją. */
export function semitonesBetween(fromKey: string, toKey: string): number | null {
  const a = parseKey(fromKey)
  const b = parseKey(toKey)
  if (!a || !b) return null
  const d = (((b.pitch - a.pitch) % 12) + 12) % 12
  return d > 6 ? d - 12 : d
}

// ---------- Tekst z akordami ----------

export function collectChords(text: string): string[] {
  const out: string[] = []
  text.replace(BRACKET_RE, (m, inner: string) => {
    if (isChord(inner)) out.push(inner)
    return m
  })
  return out
}

function tonicSpelling(chords: string[], semitones: number): Spelling | null {
  for (let i = chords.length - 1; i >= 0; i--) {
    const p = parseChord(chords[i])
    if (!p) continue
    const minor = /^(m(?!aj)|min|-)/.test(p.suffix)
    const name = conventionalKey(PITCH[p.root] + semitones, minor)
    return spellingForKey(name)
  }
  return null
}

export function transposeText(
  text: string,
  semitones: number,
  opts: { targetKey?: string | null } = {}
): string {
  if (semitones % 12 === 0) return text
  const chords = collectChords(text)
  const spelling: Spelling =
    (opts.targetKey ? spellingForKey(opts.targetKey) : null) ??
    tonicSpelling(chords, semitones) ??
    'sharp'
  return text.replace(BRACKET_RE, (m, inner: string) =>
    isChord(inner) ? `[${transposeChord(inner, semitones, spelling)}]` : m
  )
}

/** Usuwa akordy, zostawiając etykiety sekcji; linie złożone wyłącznie z akordów znikają. */
export function stripChords(text: string): string {
  const out: string[] = []
  for (const line of text.split(/\r?\n/)) {
    let had = false
    const stripped = line
      .replace(BRACKET_RE, (m, inner: string) => {
        if (isChord(inner)) {
          had = true
          return ''
        }
        return m
      })
      .replace(/[ \t]+$/, '')
    if (had && stripped.trim() === '') continue
    out.push(stripped)
  }
  return out.join('\n')
}

// ---------- Widok „akordy nad tekstem" ----------

export type PreviewLine =
  | { kind: 'text'; text: string }
  | { kind: 'label'; text: string }
  | { kind: 'chords'; chords: string; lyric: string }

export function chordsAbove(text: string): PreviewLine[] {
  const out: PreviewLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const only = /^\s*\[([^[\]]+)\]\s*$/.exec(raw)
    if (only && !isChord(only[1])) {
      out.push({ kind: 'label', text: only[1] })
      continue
    }
    if (!/\[[^[\]]*\]/.test(raw)) {
      out.push({ kind: 'text', text: raw })
      continue
    }
    let lyric = ''
    let chordLine = ''
    let pos = 0
    const re = /\[([^[\]]*)\]/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw)) !== null) {
      lyric += raw.slice(pos, m.index)
      pos = m.index + m[0].length
      if (isChord(m[1])) {
        const col = Math.max(lyric.length, chordLine.length > 0 ? chordLine.length + 1 : 0)
        chordLine = chordLine.padEnd(col, ' ') + m[1]
      } else {
        lyric += m[0]
      }
    }
    lyric += raw.slice(pos)
    out.push({ kind: 'chords', chords: chordLine, lyric })
  }
  return out
}

/** Klasyczny zapis „akordy w osobnej linii nad tekstem" → akordy w nawiasach. */
export function chordsAboveToInline(text: string): string {
  const lines = text.split(/\r?\n/)
  const isChordLine = (l: string): boolean => {
    const tokens = l.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0 || !tokens.every(isChord)) return false
    if (tokens.length >= 2) return true
    const p = parseChord(tokens[0])
    return !!p && (tokens[0].length > 1 || p.root.length > 1)
  }
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = lines[i + 1]
    if (isChordLine(line) && next !== undefined && next.trim() !== '' && !isChordLine(next)) {
      const inserts: Array<{ col: number; chord: string }> = []
      const re = /\S+/g
      let m: RegExpExecArray | null
      while ((m = re.exec(line)) !== null) inserts.push({ col: m.index, chord: m[0] })
      let lyric = next
      for (let k = inserts.length - 1; k >= 0; k--) {
        const { col, chord } = inserts[k]
        if (lyric.length < col) lyric = lyric.padEnd(col, ' ')
        lyric = lyric.slice(0, col) + `[${chord}]` + lyric.slice(col)
      }
      out.push(lyric)
      i++
    } else {
      out.push(line)
    }
  }
  return out.join('\n')
}

// ---------- Kapodaster ----------

export interface CapoSuggestion {
  capo: number
  shapes: string[]
  /** Liczba akordów „trudnych" przed i po zastosowaniu kapodastra. */
  baseCost: number
  cost: number
}

function isEasyShape(chord: string): boolean {
  const p = parseChord(chord)
  if (!p) return false
  const name = p.root + p.suffix
  return /^(C|D|E|G|A)(7|sus2|sus4|add9|2|4)?$/.test(name) || /^(A|E|D)m7?$/.test(name)
}

export function suggestCapo(text: string): CapoSuggestion | null {
  const chords = collectChords(text)
  if (chords.length < 3) return null
  const evaluate = (capo: number): { cost: number; shapes: string[] } => {
    const spelling = tonicSpelling(chords, -capo) ?? 'sharp'
    const shapes: string[] = []
    let cost = 0
    for (const c of chords) {
      const s = transposeChord(c, -capo, spelling)
      if (!isEasyShape(s)) cost++
      if (!shapes.includes(s)) shapes.push(s)
    }
    return { cost, shapes }
  }
  const base = evaluate(0)
  let best = { capo: 0, ...base }
  for (let capo = 1; capo <= 7; capo++) {
    const e = evaluate(capo)
    if (e.cost < best.cost) best = { capo, ...e }
  }
  if (best.capo === 0) return null
  if ((base.cost - best.cost) / chords.length < 0.15) return null
  return { capo: best.capo, shapes: best.shapes, baseCost: base.cost, cost: best.cost }
}
