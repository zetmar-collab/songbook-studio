// Warstwa danych niezależna od Electrona (łatwa do testowania): SQLite przez better-sqlite3,
// migracje schematu oparte o PRAGMA user_version, wyszukiwanie po znormalizowanym tekście.
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, rmSync } from 'fs'
import { basename } from 'path'
import { normalizeText, queryTokens } from '../shared/text'
import type {
  Setlist,
  SetlistDetail,
  SetlistItem,
  Song,
  SongPatch,
  Version,
  VersionKind,
  VoiceMarker,
  VoiceNote
} from '../shared/types'

/** Aktualna wersja schematu. Zwiększ ją i dopisz krok w `migrate()` przy każdej zmianie struktury. */
export const SCHEMA_VERSION = 5

const MAX_AUTO_VERSIONS = 20
const SONG_COLUMNS =
  'id, title, artist, key, tags, lyrics, chords, notes, suno_style, is_favorite, created_at, updated_at'

export class SchemaTooNewError extends Error {
  constructor(public found: number) {
    super(
      `Baza pochodzi z nowszej wersji aplikacji (schemat ${found}, ta wersja obsługuje ${SCHEMA_VERSION}). ` +
        'Zaktualizuj Songbook Studio.'
    )
    this.name = 'SchemaTooNewError'
  }
}

export interface SecretCodec {
  isSecret(key: string): boolean
  isEncrypted(value: string): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export const PLAIN_CODEC: SecretCodec = {
  isSecret: () => false,
  isEncrypted: () => false,
  encrypt: (v) => v,
  decrypt: (v) => v
}

export interface DbInspection {
  ok: boolean
  schema: number
  songs: number
  error?: string
}

/**
 * Podmienia plik bazy na `src`. Przed podmianą robi kopię awaryjną, a przy jakimkolwiek błędzie
 * (kopiowania albo otwarcia nowej bazy) przywraca poprzedni stan i otwiera go ponownie —
 * użytkownik nigdy nie zostaje bez bazy.
 */
export function swapDatabaseFile(
  dbPath: string,
  src: string,
  hooks: { close(): void; open(): void }
): void {
  const safety = dbPath + '.restore-bak'
  const live = [dbPath, dbPath + '-wal', dbPath + '-shm']
  hooks.close()
  try {
    if (existsSync(dbPath)) copyFileSync(dbPath, safety)
    for (const p of live) rmSync(p, { force: true })
    copyFileSync(src, dbPath)
    hooks.open() // uruchamia migracje starszych kopii
    rmSync(safety, { force: true })
  } catch (e) {
    hooks.close()
    for (const p of live) rmSync(p, { force: true })
    if (existsSync(safety)) copyFileSync(safety, dbPath)
    hooks.open()
    throw e
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c)
}

function searchColumns(s: {
  title: string
  artist: string
  tags: string
  lyrics: string
  chords: string
  notes: string
}): { title: string; text: string } {
  return {
    title: normalizeText(`${s.title} ${s.artist}`),
    text: normalizeText([s.title, s.artist, s.tags, s.lyrics, s.chords, s.notes].join('\n'))
  }
}

function parseMarkers(json: string): VoiceMarker[] {
  try {
    const v = JSON.parse(json)
    if (!Array.isArray(v)) return []
    return v
      .filter((m) => m && Number.isFinite(m.t) && typeof m.label === 'string')
      .map((m) => ({ t: Math.max(0, Number(m.t)), label: String(m.label).slice(0, 80) }))
  } catch {
    return []
  }
}

type VoiceRow = Omit<VoiceNote, 'markers'> & { markers: string }

export class SongbookDb {
  readonly raw: Database.Database

  constructor(
    readonly path: string,
    private readonly secrets: SecretCodec = PLAIN_CODEC
  ) {
    const existed = path !== ':memory:' && existsSync(path)
    this.raw = new Database(path)
    try {
      if (path !== ':memory:') this.raw.pragma('journal_mode = WAL')
      this.raw.pragma('foreign_keys = ON')

      const current = Number(this.raw.pragma('user_version', { simple: true }))
      if (current > SCHEMA_VERSION) throw new SchemaTooNewError(current)

      this.baseline()
      if (current < SCHEMA_VERSION) {
        if (existed && current < SCHEMA_VERSION) this.backupBeforeMigration()
        this.migrate()
      }
    } catch (e) {
      this.raw.close()
      throw e
    }
  }

  // ---------- Schemat i migracje ----------

  /** Tabele z pierwszych wersji aplikacji; nowsze kolumny dokłada `migrate()`. */
  private baseline(): void {
    this.raw.exec(`
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
    `)
  }

  private hasColumn(table: string, column: string): boolean {
    const rows = this.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    return rows.some((r) => r.name === column)
  }

  private addColumn(table: string, column: string, ddl: string): void {
    if (!this.hasColumn(table, column)) this.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`)
  }

  /** Kopia pliku bazy przed migracją — jedyna siatka bezpieczeństwa przy aktualizacji aplikacji. */
  private backupBeforeMigration(): void {
    try {
      this.raw.pragma('wal_checkpoint(TRUNCATE)')
      copyFileSync(this.path, `${this.path}.pre-v${SCHEMA_VERSION}.bak`)
    } catch {
      // brak kopii nie może blokować uruchomienia aplikacji
    }
  }

  /** Migracje są idempotentne (sprawdzają istnienie kolumn), więc działają też po przerwaniu. */
  private migrate(): void {
    const run = this.raw.transaction(() => {
      // v1 → wyszukiwanie po znormalizowanym tekście zamiast FTS5 (który nie składał „ł")
      this.raw.exec(`
        DROP TRIGGER IF EXISTS songs_ai;
        DROP TRIGGER IF EXISTS songs_ad;
        DROP TRIGGER IF EXISTS songs_au;
        DROP TABLE IF EXISTS songs_fts;
      `)
      this.addColumn('songs', 'search_title', "TEXT NOT NULL DEFAULT ''")
      this.addColumn('songs', 'search_text', "TEXT NOT NULL DEFAULT ''")
      // v2 → pole „styl dla Suno"
      this.addColumn('songs', 'suno_style', "TEXT NOT NULL DEFAULT ''")
      // v3 → nagrania: opis, znaczniki; ścieżki zamieniamy na same nazwy plików
      this.addColumn('voice_notes', 'note', "TEXT NOT NULL DEFAULT ''")
      this.addColumn('voice_notes', 'markers', "TEXT NOT NULL DEFAULT '[]'")
      // v4 → setlisty
      this.raw.exec(`
        CREATE TABLE IF NOT EXISTS setlists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS setlist_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          setlist_id INTEGER NOT NULL,
          song_id INTEGER NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          transpose INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (setlist_id) REFERENCES setlists(id) ON DELETE CASCADE,
          FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        );
      `)
      // v5 → wersje: rodzaj (ręczna/automatyczna) i tonacja z chwili zapisu
      this.addColumn('versions', 'kind', "TEXT NOT NULL DEFAULT 'manual'")
      this.addColumn('versions', 'song_key', 'TEXT')

      this.raw.exec(`
        CREATE INDEX IF NOT EXISTS idx_versions_song ON versions(song_id, created_at, id);
        CREATE INDEX IF NOT EXISTS idx_voice_song ON voice_notes(song_id);
        CREATE INDEX IF NOT EXISTS idx_setlist_items ON setlist_items(setlist_id, position);
      `)

      this.backfillSearch()
      this.normalizeVoicePaths()
      this.raw.pragma(`user_version = ${SCHEMA_VERSION}`)
    })
    run()
  }

  private backfillSearch(): void {
    const rows = this.raw
      .prepare('SELECT id, title, artist, tags, lyrics, chords, notes FROM songs')
      .all() as Array<Pick<Song, 'id' | 'title' | 'artist' | 'tags' | 'lyrics' | 'chords' | 'notes'>>
    const upd = this.raw.prepare('UPDATE songs SET search_title = ?, search_text = ? WHERE id = ?')
    for (const r of rows) {
      const s = searchColumns(r)
      upd.run(s.title, s.text, r.id)
    }
  }

  /** Starsze wersje zapisywały pełne ścieżki; od teraz wyłącznie nazwy plików. */
  private normalizeVoicePaths(): void {
    const rows = this.raw.prepare('SELECT id, file_path FROM voice_notes').all() as Array<{
      id: number
      file_path: string
    }>
    const upd = this.raw.prepare('UPDATE voice_notes SET file_path = ? WHERE id = ?')
    for (const r of rows) {
      const name = basename(r.file_path.replace(/\\/g, '/'))
      if (name !== r.file_path) upd.run(name, r.id)
    }
  }

  static inspect(path: string): DbInspection {
    let db: Database.Database | null = null
    try {
      db = new Database(path, { readonly: true, fileMustExist: true })
      const schema = Number(db.pragma('user_version', { simple: true }))
      const has = db
        .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'songs'")
        .get() as { c: number }
      if (!has.c) return { ok: false, schema, songs: 0, error: 'To nie jest kopia bazy Songbook Studio.' }
      if (schema > SCHEMA_VERSION) {
        return { ok: false, schema, songs: 0, error: new SchemaTooNewError(schema).message }
      }
      const songs = (db.prepare('SELECT COUNT(*) AS c FROM songs').get() as { c: number }).c
      return { ok: true, schema, songs }
    } catch (e) {
      return { ok: false, schema: 0, songs: 0, error: e instanceof Error ? e.message : String(e) }
    } finally {
      db?.close()
    }
  }

  // ---------- Piosenki ----------

  listSongs(): Song[] {
    return this.raw
      .prepare(`SELECT ${SONG_COLUMNS} FROM songs ORDER BY is_favorite DESC, updated_at DESC, id DESC`)
      .all() as Song[]
  }

  getSong(id: number): Song | undefined {
    return this.raw.prepare(`SELECT ${SONG_COLUMNS} FROM songs WHERE id = ?`).get(id) as Song | undefined
  }

  createSong(partial: SongPatch = {}): Song {
    const song = {
      title: partial.title ?? '',
      artist: partial.artist ?? '',
      key: partial.key ?? '',
      tags: partial.tags ?? '',
      lyrics: partial.lyrics ?? '',
      chords: partial.chords ?? '',
      notes: partial.notes ?? '',
      suno_style: partial.suno_style ?? ''
    }
    const s = searchColumns(song)
    const info = this.raw
      .prepare(
        `INSERT INTO songs (title, artist, key, tags, lyrics, chords, notes, suno_style, search_title, search_text)
         VALUES (@title, @artist, @key, @tags, @lyrics, @chords, @notes, @suno_style, @st, @sx)`
      )
      .run({ ...song, st: s.title, sx: s.text })
    return this.getSong(Number(info.lastInsertRowid))!
  }

  updateSong(id: number, patch: SongPatch): Song {
    const existing = this.getSong(id)
    if (!existing) throw new Error('Nie znaleziono utworu')
    const merged = { ...existing, ...patch }
    const fields = ['title', 'artist', 'key', 'tags', 'lyrics', 'chords', 'notes', 'suno_style'] as const
    const changed =
      fields.some((f) => merged[f] !== existing[f]) ||
      (merged.is_favorite ? 1 : 0) !== existing.is_favorite
    if (!changed) return existing // bezzmianowy zapis nie przesuwa utworu na liście

    const s = searchColumns(merged)
    this.raw
      .prepare(
        `UPDATE songs SET title=@title, artist=@artist, key=@key, tags=@tags, lyrics=@lyrics,
           chords=@chords, notes=@notes, suno_style=@suno_style, is_favorite=@fav,
           search_title=@st, search_text=@sx, updated_at=datetime('now')
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
        suno_style: merged.suno_style,
        fav: merged.is_favorite ? 1 : 0,
        st: s.title,
        sx: s.text
      })
    return this.getSong(id)!
  }

  /** Usuwa utwór i zwraca nazwy plików jego nagrań, które wywołujący powinien skasować z dysku. */
  deleteSong(id: number): string[] {
    const files = this.listVoiceNotes(id).map((n) => n.file_path)
    this.raw.prepare('DELETE FROM songs WHERE id = ?').run(id)
    return files
  }

  /** Wyszukiwanie bez rozróżniania wielkości liter i znaków diakrytycznych, także po fragmentach słów. */
  searchSongs(query: string): Song[] {
    const tokens = queryTokens(query)
    if (tokens.length === 0) return this.listSongs()
    const where = tokens.map(() => "search_text LIKE ? ESCAPE '\\'").join(' AND ')
    const titleMatch = tokens.map(() => "search_title LIKE ? ESCAPE '\\'").join(' AND ')
    const like = tokens.map((t) => `%${escapeLike(t)}%`)
    return this.raw
      .prepare(
        `SELECT ${SONG_COLUMNS} FROM songs
         WHERE ${where}
         ORDER BY (CASE WHEN ${titleMatch} THEN 0 ELSE 1 END), is_favorite DESC, updated_at DESC, id DESC`
      )
      .all(...like, ...like) as Song[]
  }

  // ---------- Wersje ----------

  listVersions(songId: number): Version[] {
    return this.raw
      .prepare('SELECT * FROM versions WHERE song_id = ? ORDER BY created_at DESC, id DESC')
      .all(songId) as Version[]
  }

  createVersion(songId: number, label: string, kind: VersionKind = 'manual'): Version {
    const song = this.getSong(songId)
    if (!song) throw new Error('Nie znaleziono utworu')
    const info = this.raw
      .prepare(
        'INSERT INTO versions (song_id, lyrics, chords, song_key, label, kind) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(songId, song.lyrics, song.chords, song.key, label, kind)
    if (kind === 'auto') {
      this.raw
        .prepare(
          `DELETE FROM versions WHERE song_id = ? AND kind = 'auto' AND id NOT IN (
             SELECT id FROM versions WHERE song_id = ? AND kind = 'auto' ORDER BY id DESC LIMIT ?)`
        )
        .run(songId, songId, MAX_AUTO_VERSIONS)
    }
    return this.raw
      .prepare('SELECT * FROM versions WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Version
  }

  restoreVersion(versionId: number): Song {
    const v = this.raw.prepare('SELECT * FROM versions WHERE id = ?').get(versionId) as Version | undefined
    if (!v) throw new Error('Nie znaleziono wersji')
    const patch: SongPatch = { lyrics: v.lyrics, chords: v.chords }
    if (v.song_key !== null) patch.key = v.song_key
    return this.updateSong(v.song_id, patch)
  }

  deleteVersion(versionId: number): void {
    this.raw.prepare('DELETE FROM versions WHERE id = ?').run(versionId)
  }

  // ---------- Nagrania ----------

  private toNote(r: VoiceRow): VoiceNote {
    return { ...r, markers: parseMarkers(r.markers) }
  }

  listVoiceNotes(songId: number): VoiceNote[] {
    const rows = this.raw
      .prepare('SELECT * FROM voice_notes WHERE song_id = ? ORDER BY created_at DESC, id DESC')
      .all(songId) as VoiceRow[]
    return rows.map((r) => this.toNote(r))
  }

  getVoiceNote(id: number): VoiceNote | undefined {
    const r = this.raw.prepare('SELECT * FROM voice_notes WHERE id = ?').get(id) as VoiceRow | undefined
    return r ? this.toNote(r) : undefined
  }

  addVoiceNote(songId: number, fileName: string, title: string, duration: number): VoiceNote {
    if (!this.getSong(songId)) throw new Error('Nie znaleziono utworu')
    const info = this.raw
      .prepare('INSERT INTO voice_notes (song_id, file_path, title, duration) VALUES (?, ?, ?, ?)')
      .run(songId, basename(fileName), title.slice(0, 200), Math.max(0, duration || 0))
    return this.getVoiceNote(Number(info.lastInsertRowid))!
  }

  updateVoiceNote(
    id: number,
    patch: { title?: string; note?: string; markers?: VoiceMarker[] }
  ): VoiceNote {
    const cur = this.getVoiceNote(id)
    if (!cur) throw new Error('Nie znaleziono notatki głosowej')
    const markers = (patch.markers ?? cur.markers)
      .filter((m) => Number.isFinite(m.t) && typeof m.label === 'string')
      .slice(0, 200)
      .map((m) => ({ t: Math.max(0, m.t), label: m.label.slice(0, 80) }))
      .sort((a, b) => a.t - b.t)
    this.raw
      .prepare('UPDATE voice_notes SET title = ?, note = ?, markers = ? WHERE id = ?')
      .run((patch.title ?? cur.title).slice(0, 200), (patch.note ?? cur.note).slice(0, 2000), JSON.stringify(markers), id)
    return this.getVoiceNote(id)!
  }

  deleteVoiceNote(id: number): VoiceNote | undefined {
    const note = this.getVoiceNote(id)
    this.raw.prepare('DELETE FROM voice_notes WHERE id = ?').run(id)
    return note
  }

  // ---------- Ustawienia ----------

  getSetting(key: string): string {
    const row = this.raw.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    const value = row?.value ?? ''
    return this.secrets.isSecret(key) ? this.secrets.decrypt(value) : value
  }

  getAllSettings(): Record<string, string> {
    const rows = this.raw.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
    return Object.fromEntries(
      rows.map((r) => [r.key, this.secrets.isSecret(r.key) ? this.secrets.decrypt(r.value) : r.value])
    )
  }

  setSetting(key: string, value: string): void {
    const stored = this.secrets.isSecret(key) ? this.secrets.encrypt(value) : value
    this.raw
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, stored)
  }

  /** Doszyfrowuje klucze API zapisane jawnie przez wcześniejsze wersje aplikacji. */
  migrateSecrets(): void {
    const rows = this.raw.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
    for (const r of rows) {
      if (this.secrets.isSecret(r.key) && r.value && !this.secrets.isEncrypted(r.value)) {
        this.setSetting(r.key, r.value)
      }
    }
  }

  // ---------- Setlisty ----------

  private touchSetlist(id: number): void {
    this.raw.prepare("UPDATE setlists SET updated_at = datetime('now') WHERE id = ?").run(id)
  }

  private renumber(setlistId: number): void {
    const ids = this.raw
      .prepare('SELECT id FROM setlist_items WHERE setlist_id = ? ORDER BY position, id')
      .all(setlistId) as Array<{ id: number }>
    const upd = this.raw.prepare('UPDATE setlist_items SET position = ? WHERE id = ?')
    ids.forEach((r, i) => upd.run(i, r.id))
  }

  listSetlists(): Setlist[] {
    return this.raw
      .prepare(
        `SELECT s.id, s.name, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM setlist_items i WHERE i.setlist_id = s.id) AS item_count
         FROM setlists s ORDER BY s.updated_at DESC, s.id DESC`
      )
      .all() as Setlist[]
  }

  getSetlist(id: number): SetlistDetail | undefined {
    const setlist = this.listSetlists().find((s) => s.id === id)
    if (!setlist) return undefined
    const items = this.raw
      .prepare(
        `SELECT i.id, i.setlist_id, i.song_id, i.position, i.transpose,
                s.title, s.artist, s.key, s.lyrics, s.chords
         FROM setlist_items i JOIN songs s ON s.id = i.song_id
         WHERE i.setlist_id = ? ORDER BY i.position, i.id`
      )
      .all(id) as SetlistItem[]
    return { setlist, items }
  }

  createSetlist(name: string): Setlist {
    const info = this.raw.prepare('INSERT INTO setlists (name) VALUES (?)').run(name.trim().slice(0, 120))
    return this.listSetlists().find((s) => s.id === Number(info.lastInsertRowid))!
  }

  renameSetlist(id: number, name: string): void {
    this.raw.prepare('UPDATE setlists SET name = ? WHERE id = ?').run(name.trim().slice(0, 120), id)
    this.touchSetlist(id)
  }

  deleteSetlist(id: number): void {
    this.raw.prepare('DELETE FROM setlists WHERE id = ?').run(id)
  }

  addToSetlist(setlistId: number, songId: number): void {
    const dup = this.raw
      .prepare('SELECT id FROM setlist_items WHERE setlist_id = ? AND song_id = ?')
      .get(setlistId, songId)
    if (dup) return
    const max = this.raw
      .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM setlist_items WHERE setlist_id = ?')
      .get(setlistId) as { m: number }
    this.raw
      .prepare('INSERT INTO setlist_items (setlist_id, song_id, position) VALUES (?, ?, ?)')
      .run(setlistId, songId, max.m + 1)
    this.touchSetlist(setlistId)
  }

  removeFromSetlist(itemId: number): void {
    const row = this.raw.prepare('SELECT setlist_id FROM setlist_items WHERE id = ?').get(itemId) as
      | { setlist_id: number }
      | undefined
    if (!row) return
    this.raw.prepare('DELETE FROM setlist_items WHERE id = ?').run(itemId)
    this.renumber(row.setlist_id)
    this.touchSetlist(row.setlist_id)
  }

  moveSetlistItem(itemId: number, direction: -1 | 1): void {
    const row = this.raw
      .prepare('SELECT setlist_id FROM setlist_items WHERE id = ?')
      .get(itemId) as { setlist_id: number } | undefined
    if (!row) return
    this.renumber(row.setlist_id)
    const items = this.raw
      .prepare('SELECT id, position FROM setlist_items WHERE setlist_id = ? ORDER BY position')
      .all(row.setlist_id) as Array<{ id: number; position: number }>
    const idx = items.findIndex((i) => i.id === itemId)
    const other = items[idx + direction]
    if (idx < 0 || !other) return
    const upd = this.raw.prepare('UPDATE setlist_items SET position = ? WHERE id = ?')
    upd.run(other.position, itemId)
    upd.run(items[idx].position, other.id)
    this.touchSetlist(row.setlist_id)
  }

  setItemTranspose(itemId: number, semitones: number): void {
    const clamped = Math.max(-11, Math.min(11, Math.round(semitones)))
    this.raw.prepare('UPDATE setlist_items SET transpose = ? WHERE id = ?').run(clamped, itemId)
  }

  // ---------- Pliki ----------

  /** Spójna kopia bazy (także w trybie WAL) pod wskazaną ścieżką. */
  async backupTo(dest: string): Promise<void> {
    await this.raw.backup(dest)
  }

  checkpoint(): void {
    this.raw.pragma('wal_checkpoint(TRUNCATE)')
  }

  close(): void {
    try {
      this.raw.close()
    } catch {
      // ignoruj
    }
  }
}
