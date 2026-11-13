// Walidacja danych przychodzących z renderera przez IPC. Renderer jest traktowany jak
// niezaufany: sprawdzamy typy i długości, zanim cokolwiek trafi do bazy lub na dysk.
import type { SongPatch, VoiceMarker } from '../shared/types'

export function asInt(v: unknown, name = 'id'): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`Nieprawidłowa wartość: ${name}`)
  return v
}

export function asString(v: unknown, max: number, name = 'tekst'): string {
  if (typeof v !== 'string') throw new Error(`Nieprawidłowa wartość: ${name}`)
  if (v.length > max) throw new Error(`Wartość „${name}" jest zbyt długa (maks. ${max} znaków).`)
  return v
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new Error(`Nieprawidłowa wartość: ${name}`)
  return v as T
}

const SONG_LIMITS: Record<string, number> = {
  title: 300,
  artist: 300,
  key: 40,
  tags: 500,
  lyrics: 300_000,
  chords: 300_000,
  notes: 200_000,
  suno_style: 5_000
}

export function asSongPatch(v: unknown): SongPatch {
  if (v === null || typeof v !== 'object') throw new Error('Nieprawidłowe dane utworu.')
  const src = v as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, max] of Object.entries(SONG_LIMITS)) {
    if (src[key] !== undefined) out[key] = asString(src[key], max, key)
  }
  if (src.is_favorite !== undefined) out.is_favorite = src.is_favorite ? 1 : 0
  return out as SongPatch
}

export function asMarkers(v: unknown): VoiceMarker[] {
  if (!Array.isArray(v)) throw new Error('Nieprawidłowe znaczniki.')
  return v.slice(0, 200).map((m) => {
    const t = (m as { t?: unknown }).t
    const label = (m as { label?: unknown }).label
    if (typeof t !== 'number' || !Number.isFinite(t) || typeof label !== 'string') {
      throw new Error('Nieprawidłowy znacznik.')
    }
    return { t, label }
  })
}

/** Klucze ustawień, które renderer może zmieniać. Reszta (np. backup_dir) ma własne kanały. */
export const WRITABLE_SETTINGS = [
  'ai_provider',
  'openrouter_api_key',
  'openrouter_model',
  'gemini_api_key',
  'gemini_model',
  'auto_backup'
] as const

export function asSettingKey(v: unknown): (typeof WRITABLE_SETTINGS)[number] {
  return oneOf(v, WRITABLE_SETTINGS, 'klucz ustawienia')
}

export function asSettingValue(key: string, v: unknown): string {
  const value = asString(v, 4096, 'wartość ustawienia')
  if (key === 'ai_provider') return oneOf(value, ['openrouter', 'gemini'] as const, key)
  if (key === 'auto_backup') return oneOf(value, ['on', 'off'] as const, key)
  return value
}
