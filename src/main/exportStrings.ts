// Napisy używane w plikach eksportu — zależne od języka interfejsu, a nie na stałe po polsku.
import type { Lang } from '../shared/types'

function plSongs(n: number): string {
  if (n === 1) return '1 utwór'
  const m10 = n % 10
  const m100 = n % 100
  return m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14) ? `${n} utwory` : `${n} utworów`
}

export interface ExportStrings {
  untitled: string
  key: string
  tags: string
  notes: string
  songbook: string
  toc: string
  songs(n: number): string
  locale: string
}

export function strings(lang: Lang): ExportStrings {
  if (lang === 'en') {
    return {
      untitled: 'Untitled',
      key: 'Key',
      tags: 'Tags',
      notes: 'Notes',
      songbook: 'Songbook',
      toc: 'Contents',
      songs: (n) => (n === 1 ? '1 song' : `${n} songs`),
      locale: 'en-US'
    }
  }
  return {
    untitled: 'Bez tytułu',
    key: 'Tonacja',
    tags: 'Tagi',
    notes: 'Notatki',
    songbook: 'Śpiewnik',
    toc: 'Spis treści',
    songs: plSongs,
    locale: 'pl-PL'
  }
}
