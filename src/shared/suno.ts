// Przygotowanie tekstu do wklejenia w Suno: bez akordów, z etykietami sekcji
// w formie [Verse], [Chorus] itd.
import { stripChords } from './chords'

const SECTION_MAP: Record<string, string> = {
  zwrotka: 'Verse',
  refren: 'Chorus',
  mostek: 'Bridge',
  wstep: 'Intro',
  zakonczenie: 'Outro',
  przedrefren: 'Pre-Chorus',
  solo: 'Solo',
  interludium: 'Interlude'
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ł/g, 'l')
}

/** „Zwrotka 2" → „Verse 2"; nieznane etykiety zostają bez zmian. */
export function translateSectionLabel(label: string): string {
  const m = /^\s*(\S+)(\s+\d+)?\s*$/.exec(label)
  if (!m) return label
  const english = SECTION_MAP[fold(m[1])]
  return english ? english + (m[2] ?? '') : label
}

export function toSunoLyrics(text: string, englishTags: boolean): string {
  const lines = stripChords(text).split('\n')
  const out = lines.map((line) => {
    const only = /^\s*\[([^[\]]+)\]\s*$/.exec(line)
    if (!only) return line
    return `[${englishTags ? translateSectionLabel(only[1]) : only[1]}]`
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
