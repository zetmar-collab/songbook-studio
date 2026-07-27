import { app } from 'electron'
import { join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs'
import Database from 'better-sqlite3'

export interface Song {
  id: number
  title: string
  artist: string
  key: string
  tags: string
  lyrics: string
  chords: string
  notes: string
  is_favorite: number
  created_at: string
  updated_at: string
}

export interface Version {
  id: number
  song_id: number
  lyrics: string
  chords: string
  label: string
  created_at: string
}

export interface VoiceNote {
  id: number
  song_id: number
  file_path: string
  title: string
  duration: number
  created_at: string
}

export interface Setting {
  key: string
  value: string
}

let db: Database.Database
let dbPath: string

export function getDbPath(): string {
  return dbPath
}

export function initDb(): Database.Database {
  dbPath = join(app.getPath('userData'), 'songbook.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      artist TEXT NOT NULL DEFAULT '',
      key TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      lyrics TEXT NOT NULL DEFAULT '',
      chords TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      lyrics TEXT NOT NULL DEFAULT '',
      chords TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voice_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      duration REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
      title, artist, tags, lyrics, chords, notes,
      content='songs', content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
      INSERT INTO songs_fts(rowid, title, artist, tags, lyrics, chords, notes)
      VALUES (new.id, new.title, new.artist, new.tags, new.lyrics, new.chords, new.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
      INSERT INTO songs_fts(songs_fts, rowid, title, artist, tags, lyrics, chords, notes)
      VALUES ('delete', old.id, old.title, old.artist, old.tags, old.lyrics, old.chords, old.notes);
    END;

    CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
      INSERT INTO songs_fts(songs_fts, rowid, title, artist, tags, lyrics, chords, notes)
      VALUES ('delete', old.id, old.title, old.artist, old.tags, old.lyrics, old.chords, old.notes);
      INSERT INTO songs_fts(rowid, title, artist, tags, lyrics, chords, notes)
      VALUES (new.id, new.title, new.artist, new.tags, new.lyrics, new.chords, new.notes);
    END;
  `)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Baza danych nie została zainicjalizowana')
  return db
}

// ---------- Songs ----------

export function listSongs(): Song[] {
  return getDb()
    .prepare('SELECT * FROM songs ORDER BY is_favorite DESC, updated_at DESC')
    .all() as Song[]
}

export function getSong(id: number): Song | undefined {
  return getDb().prepare('SELECT * FROM songs WHERE id = ?').get(id) as Song | undefined
}

export function createSong(partial: Partial<Song>): Song {
  const info = getDb()
    .prepare(
      `INSERT INTO songs (title, artist, key, tags, lyrics, chords, notes)
       VALUES (@title, @artist, @key, @tags, @lyrics, @chords, @notes)`
    )
    .run({
      title: partial.title ?? '',
      artist: partial.artist ?? '',
      key: partial.key ?? '',
      tags: partial.tags ?? '',
      lyrics: partial.lyrics ?? '',
      chords: partial.chords ?? '',
      notes: partial.notes ?? ''
    })
  return getSong(Number(info.lastInsertRowid))!
}

export function updateSong(id: number, partial: Partial<Song>): Song {
  const existing = getSong(id)
  if (!existing) throw new Error('Nie znaleziono utworu')
  const merged = { ...existing, ...partial }
  getDb()
    .prepare(
      `UPDATE songs SET
        title=@title, artist=@artist, key=@key, tags=@tags,
        lyrics=@lyrics, chords=@chords, notes=@notes,
        is_favorite=@is_favorite, updated_at=datetime('now')
       WHERE id=@id`
    )
    .run({
      id,
      title: merged.title,
      artist: merged.artist,
      key: merged.key,
      tags: merged.tags,
      lyrics: merged.lyrics,
      chords: merged.chords,
      notes: merged.notes,
      is_favorite: merged.is_favorite ? 1 : 0
    })
  return getSong(id)!
}

export function deleteSong(id: number): void {
  getDb().prepare('DELETE FROM songs WHERE id = ?').run(id)
}

export function searchSongs(query: string): Song[] {
  const q = query.trim()
  if (!q) return listSongs()
  // Zamień na zapytanie prefiksowe FTS5, sanityzując znaki specjalne
  const match = q
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ''))
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(' ')
  if (!match) return listSongs()
  try {
    return getDb()
      .prepare(
        `SELECT s.* FROM songs s
         JOIN songs_fts f ON f.rowid = s.id
         WHERE songs_fts MATCH ?
         ORDER BY rank`
      )
      .all(match) as Song[]
  } catch {
    return listSongs()
  }
}

// ---------- Versions ----------

export function listVersions(songId: number): Version[] {
  return getDb()
    .prepare('SELECT * FROM versions WHERE song_id = ? ORDER BY created_at DESC')
    .all(songId) as Version[]
}

export function createVersion(songId: number, label: string): Version {
  const song = getSong(songId)
  if (!song) throw new Error('Nie znaleziono utworu')
  const info = getDb()
    .prepare(
      `INSERT INTO versions (song_id, lyrics, chords, label)
       VALUES (?, ?, ?, ?)`
    )
    .run(songId, song.lyrics, song.chords, label)
  return getDb()
    .prepare('SELECT * FROM versions WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as Version
}

export function restoreVersion(versionId: number): Song {
  const version = getDb()
    .prepare('SELECT * FROM versions WHERE id = ?')
    .get(versionId) as Version | undefined
  if (!version) throw new Error('Nie znaleziono wersji')
  return updateSong(version.song_id, {
    lyrics: version.lyrics,
    chords: version.chords
  })
}

export function deleteVersion(versionId: number): void {
  getDb().prepare('DELETE FROM versions WHERE id = ?').run(versionId)
}

// ---------- Voice notes ----------

export function listVoiceNotes(songId: number): VoiceNote[] {
  return getDb()
    .prepare('SELECT * FROM voice_notes WHERE song_id = ? ORDER BY created_at DESC')
    .all(songId) as VoiceNote[]
}

export function addVoiceNote(
  songId: number,
  filePath: string,
  title: string,
  duration: number
): VoiceNote {
  const info = getDb()
    .prepare(
      `INSERT INTO voice_notes (song_id, file_path, title, duration)
       VALUES (?, ?, ?, ?)`
    )
    .run(songId, filePath, title, duration)
  return getDb()
    .prepare('SELECT * FROM voice_notes WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as VoiceNote
}

export function getVoiceNote(id: number): VoiceNote | undefined {
  return getDb().prepare('SELECT * FROM voice_notes WHERE id = ?').get(id) as
    | VoiceNote
    | undefined
}

export function deleteVoiceNote(id: number): VoiceNote | undefined {
  const note = getVoiceNote(id)
  getDb().prepare('DELETE FROM voice_notes WHERE id = ?').run(id)
  return note
}

// ---------- Settings ----------

export function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Setting[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value)
}

// ---------- Kopie zapasowe ----------

export function closeDb(): void {
  try {
    db?.close()
  } catch {
    // ignoruj
  }
}

/** Tworzy spójną kopię bazy (obsługuje WAL) pod wskazaną ścieżką. */
export async function backupTo(dest: string): Promise<void> {
  await getDb().backup(dest)
}

/** Zastępuje bieżącą bazę plikiem kopii i ponownie ją otwiera. */
export function restoreFrom(src: string): void {
  if (!existsSync(src)) throw new Error('Plik kopii nie istnieje.')
  // Walidacja: czy to poprawna baza SQLite z tabelą songs
  const test = new Database(src, { readonly: true })
  try {
    test.prepare('SELECT COUNT(*) FROM songs').get()
  } catch {
    test.close()
    throw new Error('To nie jest poprawna kopia bazy Songbook Studio.')
  }
  test.close()

  closeDb()
  for (const ext of ['', '-wal', '-shm']) {
    const p = dbPath + ext
    if (existsSync(p)) rmSync(p, { force: true })
  }
  copyFileSync(src, dbPath)
  initDb()
}

/** Automatyczna kopia w wybranym (lub domyślnym) katalogu; zachowuje ostatnie `keep`. */
export function autoBackup(keep = 10): string | null {
  try {
    const dir = backupsDir()
    mkdirSync(dir, { recursive: true })
    // wymuś zapis WAL do głównego pliku, potem kopiuj
    db.pragma('wal_checkpoint(TRUNCATE)')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dest = join(dir, `songbook-${stamp}.db`)
    copyFileSync(dbPath, dest)

    // przytnij do ostatnich `keep`
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('songbook-') && f.endsWith('.db'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const old of files.slice(keep)) {
      rmSync(join(dir, old.f), { force: true })
    }
    return dest
  } catch {
    return null
  }
}

/** Katalog kopii: wybrany przez użytkownika (setting `backup_dir`) lub domyślny. */
export function backupsDir(): string {
  const custom = getSetting('backup_dir')
  return custom && custom.trim() ? custom : join(app.getPath('userData'), 'backups')
}
