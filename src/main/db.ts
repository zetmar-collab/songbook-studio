// Powiązanie bazy z Electronem: lokalizacja plików, szyfrowanie kluczy API,
// bezpieczne ścieżki nagrań, kopie zapasowe i przywracanie.
import { app } from 'electron'
import { basename, join, resolve, sep } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import { SongbookDb, swapDatabaseFile } from './database'
import { decryptSecret, encryptSecret, isEncrypted, isSecret } from './secrets'

let db: SongbookDb | null = null
let dbPath = ''

export function initDb(): SongbookDb {
  dbPath = join(app.getPath('userData'), 'songbook.db')
  db = new SongbookDb(dbPath, {
    isSecret,
    isEncrypted,
    encrypt: encryptSecret,
    decrypt: decryptSecret
  })
  db.migrateSecrets()
  return db
}

export function getDb(): SongbookDb {
  if (!db) throw new Error('Baza danych nie została zainicjalizowana')
  return db
}

export function getDbPath(): string {
  return dbPath
}

export function closeDb(): void {
  db?.close()
  db = null
}

export function getSetting(key: string): string {
  return getDb().getSetting(key)
}

export function setSetting(key: string, value: string): void {
  getDb().setSetting(key, value)
}

// ---------- Nagrania: wyłącznie nazwy plików, nigdy ścieżki z bazy ----------

export function voiceDir(): string {
  return join(app.getPath('userData'), 'voice-notes')
}

const SAFE_NAME = /^[A-Za-z0-9._-]{1,128}$/

export function isSafeVoiceName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.startsWith('.')
}

/** Ścieżka pliku nagrania; odrzuca nazwy wychodzące poza katalog nagrań. */
export function voiceFilePath(name: string): string {
  const base = basename(name.replace(/\\/g, '/'))
  if (!isSafeVoiceName(base)) throw new Error('Nieprawidłowa nazwa pliku nagrania.')
  const dir = resolve(voiceDir())
  const full = resolve(dir, base)
  if (!full.startsWith(dir + sep)) throw new Error('Nieprawidłowa ścieżka pliku nagrania.')
  return full
}

// ---------- Kopie zapasowe ----------

/** Katalog kopii: wybrany przez użytkownika (ustawienie `backup_dir`) lub domyślny. */
export function backupsDir(): string {
  const custom = getSetting('backup_dir')
  return custom && custom.trim() ? custom : join(app.getPath('userData'), 'backups')
}

/** Automatyczna kopia samej bazy przy zamknięciu; zachowuje ostatnie `keep`. */
export function autoBackup(keep = 10): string | null {
  try {
    const dir = backupsDir()
    mkdirSync(dir, { recursive: true })
    getDb().checkpoint()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dest = join(dir, `songbook-${stamp}.db`)
    copyFileSync(dbPath, dest)

    const files = readdirSync(dir)
      .filter((f) => /^songbook-\d{4}-.*\.db$/.test(f))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const old of files.slice(keep)) rmSync(join(dir, old.f), { force: true })
    return dest
  } catch {
    return null
  }
}

/** Zastępuje bieżącą bazę wskazanym plikiem (z kopią awaryjną i cofnięciem przy błędzie). */
export function restoreDbFile(src: string): { songs: number } {
  const info = SongbookDb.inspect(src)
  if (!info.ok) throw new Error(info.error ?? 'Nieprawidłowy plik kopii.')
  getDb().checkpoint()
  swapDatabaseFile(dbPath, src, {
    close: closeDb,
    open: () => {
      initDb()
    }
  })
  return { songs: info.songs }
}
