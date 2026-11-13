// Typy wspólne dla procesu głównego, preloadu i rendererera.

export interface Song {
  id: number
  title: string
  artist: string
  key: string
  tags: string
  lyrics: string
  chords: string
  notes: string
  suno_style: string
  is_favorite: number
  created_at: string
  updated_at: string
}

export type SongPatch = Partial<
  Pick<Song, 'title' | 'artist' | 'key' | 'tags' | 'lyrics' | 'chords' | 'notes' | 'suno_style' | 'is_favorite'>
>

export type VersionKind = 'manual' | 'auto'

export interface Version {
  id: number
  song_id: number
  lyrics: string
  chords: string
  /** Tonacja z chwili zapisu wersji; null dla starych wersji sprzed 1.1. */
  song_key: string | null
  label: string
  kind: VersionKind
  created_at: string
}

export interface VoiceMarker {
  /** Sekunda nagrania. */
  t: number
  label: string
}

export interface VoiceNote {
  id: number
  song_id: number
  /** Wyłącznie nazwa pliku w katalogu nagrań — nigdy ścieżka. */
  file_path: string
  title: string
  note: string
  markers: VoiceMarker[]
  duration: number
  created_at: string
}

export interface Setlist {
  id: number
  name: string
  item_count: number
  created_at: string
  updated_at: string
}

export interface SetlistItem {
  id: number
  setlist_id: number
  song_id: number
  position: number
  /** Przesunięcie tonacji w półtonach stosowane w eksporcie i trybie scenicznym. */
  transpose: number
  title: string
  artist: string
  key: string
  lyrics: string
  chords: string
}

export interface SetlistDetail {
  setlist: Setlist
  items: SetlistItem[]
}

export type ExportFormat = 'pdf' | 'docx' | 'md'
export type SingleExportFormat = ExportFormat | 'cho'
export type Lang = 'pl' | 'en'
