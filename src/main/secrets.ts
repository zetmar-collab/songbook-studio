import { safeStorage } from 'electron'

/**
 * Szyfrowanie danych wrazliwych przechowywanych w bazie ustawien.
 *
 * Uzywa safeStorage Electrona — na Windows opiera sie na DPAPI, wiec klucz
 * szyfrujacy jest powiazany z kontem uzytkownika systemu. Dzieki temu klucze API
 * pozostaja nieczytelne dla kogos, kto uzyska sam plik bazy (np. z kopii zapasowej
 * albo z katalogu synchronizowanego z chmura).
 */

const PREFIX = 'enc:v1:'
const SECRET_KEYS = new Set(['openrouter_api_key', 'gemini_api_key'])

/** Czy dane ustawienie przechowuje dane wrazliwe. */
export function isSecret(key: string): boolean {
  return SECRET_KEYS.has(key)
}

/** Czy zapisana wartosc jest juz zaszyfrowana. */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptSecret(value: string): string {
  if (!value) return ''
  try {
    if (!safeStorage.isEncryptionAvailable()) return value
    return PREFIX + safeStorage.encryptString(value).toString('base64')
  } catch {
    // Bez szyfrowania lepiej zapisac wartosc jawnie niz zgubic klucz uzytkownika.
    return value
  }
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  // Wartosc zapisana przez starsza wersje aplikacji — jeszcze niezaszyfrowana.
  if (!isEncrypted(stored)) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'))
  } catch {
    // Np. baza przywrocona z kopii na innym koncie Windows — klucza nie da sie
    // odszyfrowac. Zwracamy pusta wartosc, uzytkownik wpisze klucz ponownie.
    return ''
  }
}
