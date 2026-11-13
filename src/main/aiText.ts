// Czyste funkcje tekstowe modułu AI (bez zależności od Electrona — łatwe do testowania).
import type { Lang } from '../shared/types'

export interface ChordRequest {
  title: string
  artist: string
  key: string
  lyrics: string
  language: Lang
}

/** Zdejmuje blok kodu ``` , w który modele często opakowują odpowiedź. */
export function cleanAiOutput(text: string): string {
  let t = text.trim()
  const open = /^```[\w-]*[ \t]*\r?\n/.exec(t)
  if (open) {
    t = t.slice(open[0].length)
    t = t.replace(/\r?\n?```\s*$/, '')
  }
  return t.trim()
}

export function buildPrompt(req: ChordRequest): string {
  const langNote =
    req.language === 'pl'
      ? 'Odpowiadaj wyłącznie w języku polskim (poza symbolami akordów).'
      : 'Respond only in English (apart from chord symbols).'

  return [
    'You are an expert musician and arranger.',
    'Given the song lyrics below, produce a chord chart.',
    'Rules:',
    '- Place chord symbols in square brackets inline, immediately before the syllable where the chord changes, e.g. "[C]Hello [G]world".',
    '- Keep the original lyric lines and their order.',
    '- Keep section labels that are alone on a line in square brackets (e.g. [Refren], [Chorus]) exactly as they are.',
    '- Use standard chord notation (C, Am, G7, Dm, F#m, etc.).',
    '- If a key is provided, stay diatonic to that key where sensible.',
    '- Do not add explanations and do not wrap the answer in a code block — only return the annotated lyrics.',
    langNote,
    '',
    `Title: ${req.title || '(unknown)'}`,
    `Artist: ${req.artist || '(unknown)'}`,
    `Key: ${req.key || '(not specified)'}`,
    '',
    'Lyrics:',
    req.lyrics
  ].join('\n')
}
