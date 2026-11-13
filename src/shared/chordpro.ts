// Import i eksport formatu ChordPro (.cho / .chordpro / .pro) oraz zwykłych plików
// tekstowych z akordami.
import { chordsAboveToInline, isChord, stripChords } from './chords'

export interface ParsedSong {
  title: string
  artist: string
  key: string
  notes: string
  lyrics: string
  /** Tekst z akordami w nawiasach; pusty, gdy w pliku nie było akordów. */
  chords: string
}

const SECTION_START: Record<string, string> = {
  start_of_verse: 'Zwrotka',
  sov: 'Zwrotka',
  start_of_chorus: 'Refren',
  soc: 'Refren',
  start_of_bridge: 'Mostek',
  sob: 'Mostek'
}

const SECTION_END = new Set([
  'end_of_verse', 'eov', 'end_of_chorus', 'eoc', 'end_of_bridge', 'eob', 'end_of_tab', 'eot', 'start_of_tab', 'sot'
])

function hasChords(text: string): boolean {
  const re = /\[([^[\]\n]*)\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) if (isChord(m[1])) return true
  return false
}

/** Parser ChordPro: dyrektywy {title:}, {artist:}, {key:}, {comment:} i sekcje. */
export function parseChordPro(source: string): ParsedSong {
  const meta = { title: '', artist: '', key: '' }
  const notes: string[] = []
  const body: string[] = []

  for (const raw of source.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('#')) continue
    const dir = /^\s*\{\s*([A-Za-z_]+)\s*(?::|\s)?\s*(.*?)\s*\}\s*$/.exec(line)
    if (!dir) {
      body.push(line)
      continue
    }
    const name = dir[1].toLowerCase()
    const value = dir[2]
    if (name === 'title' || name === 't') meta.title = value
    else if (name === 'subtitle' || name === 'st' || name === 'artist') {
      if (!meta.artist) meta.artist = value
    } else if (name === 'key') meta.key = value
    else if (name === 'capo') notes.push(`Kapodaster: ${value}`)
    else if (name === 'tempo') notes.push(`Tempo: ${value}`)
    else if (name === 'comment' || name === 'c' || name === 'ci' || name === 'cb') {
      if (value) body.push(`[${value}]`)
    } else if (SECTION_START[name]) body.push(`[${value || SECTION_START[name]}]`)
    else if (SECTION_END.has(name)) continue
  }

  const text = body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const withChords = hasChords(text)
  return {
    title: meta.title,
    artist: meta.artist,
    key: meta.key,
    notes: notes.join('\n'),
    lyrics: withChords ? stripChords(text) : text,
    chords: withChords ? text : ''
  }
}

/** Zwykły plik tekstowy: zachowuje akordy w nawiasach albo konwertuje akordy nad tekstem. */
export function parsePlainText(source: string): ParsedSong {
  const clean = source.replace(/^﻿/, '')
  const inline = hasChords(clean) ? clean : chordsAboveToInline(clean)
  const text = inline.trim()
  const withChords = hasChords(text)
  return {
    title: '',
    artist: '',
    key: '',
    notes: '',
    lyrics: withChords ? stripChords(text) : text,
    chords: withChords ? text : ''
  }
}

/** Utwór → ChordPro. Etykiety sekcji zamieniane są na {comment: …}. */
export function songToChordPro(song: {
  title: string
  artist: string
  key: string
  tags: string
  notes: string
  lyrics: string
  chords: string
}): string {
  const out: string[] = []
  if (song.title) out.push(`{title: ${song.title}}`)
  if (song.artist) out.push(`{artist: ${song.artist}}`)
  if (song.key) out.push(`{key: ${song.key}}`)
  if (song.tags) out.push(`# Tagi: ${song.tags}`)
  out.push('')
  const body = (song.chords.trim() ? song.chords : song.lyrics).split(/\r?\n/)
  for (const line of body) {
    const only = /^\s*\[([^[\]]+)\]\s*$/.exec(line)
    out.push(only && !isChord(only[1]) ? `{comment: ${only[1]}}` : line)
  }
  if (song.notes.trim()) {
    out.push('')
    for (const n of song.notes.split(/\r?\n/)) out.push(`# ${n}`)
  }
  return out.join('\n') + '\n'
}
