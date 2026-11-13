// Testy warstwy danych. Uruchamiane pod Electronem (ELECTRON_RUN_AS_NODE), bo better-sqlite3
// jest zbudowany pod ABI Electrona:  npm run test:db
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { SCHEMA_VERSION, SchemaTooNewError, SongbookDb, swapDatabaseFile } from '../src/main/database'

let dir: string
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'sb-db-'))
})
after(() => {
  rmSync(dir, { recursive: true, force: true })
})

const mem = (): SongbookDb => new SongbookDb(':memory:')

describe('wyszukiwanie', () => {
  const db = mem()
  db.createSong({ title: 'Łódź nocą', lyrics: 'Idę przez ulice miasta' })
  db.createSong({ title: 'Żółć i błękit', lyrics: 'Ćma leci do światła' })
  db.createSong({ title: 'Rzeka', lyrics: 'Płyniesz rzeko, szumi wiatr', chords: '[Am]Płyniesz [F]rzeko' })
  const titles = (q: string): string[] => db.searchSongs(q).map((s) => s.title)

  it('składa polskie znaki, także ł (regresja)', () => {
    assert.deepEqual(titles('lodz'), ['Łódź nocą'])
    assert.deepEqual(titles('zolc'), ['Żółć i błękit'])
    assert.deepEqual(titles('swiatla'), ['Żółć i błękit'])
    assert.deepEqual(titles('plyniesz'), ['Rzeka'])
    assert.deepEqual(titles('ŁÓDŹ'), ['Łódź nocą'])
  })
  it('znajduje fragmenty w środku słowa (regresja)', () => {
    assert.deepEqual(titles('iasta'), ['Łódź nocą'])
    assert.deepEqual(titles('zeka'), ['Rzeka'])
  })
  it('wymaga wszystkich słów (AND) i szuka też w akordach', () => {
    assert.deepEqual(titles('ulice miasta'), ['Łódź nocą'])
    assert.deepEqual(titles('ulice rzeko'), [])
    assert.deepEqual(titles('am'), ['Rzeka'])
  })
  it('znaki specjalne LIKE i cudzysłowy nie psują zapytania', () => {
    assert.deepEqual(titles('%'), [])
    assert.deepEqual(titles('_'), [])
    assert.deepEqual(titles('"rzeka"'), ['Rzeka'])
    assert.deepEqual(titles('\\'), [])
  })
  it('puste zapytanie zwraca wszystko', () => {
    assert.equal(db.searchSongs('   ').length, 3)
  })
  it('trafienia w tytule są przed trafieniami w tekście', () => {
    const d = mem()
    d.createSong({ title: 'Inna', lyrics: 'wiatr wiatr' })
    d.createSong({ title: 'Wiatr', lyrics: 'nic' })
    assert.deepEqual(d.searchSongs('wiatr').map((s) => s.title), ['Wiatr', 'Inna'])
  })
  it('indeks wyszukiwania aktualizuje się po edycji', () => {
    const d = mem()
    const s = d.createSong({ title: 'Stary' })
    d.updateSong(s.id, { title: 'Nowy tytuł' })
    assert.deepEqual(d.searchSongs('stary'), [])
    assert.equal(d.searchSongs('nowy').length, 1)
  })
})

describe('piosenki', () => {
  it('bezzmianowy zapis nie zmienia updated_at (lista się nie przestawia)', () => {
    const d = mem()
    const s = d.createSong({ title: 'A', lyrics: 'x' })
    d.raw.prepare("UPDATE songs SET updated_at = '2000-01-01 00:00:00' WHERE id = ?").run(s.id)
    const after = d.updateSong(s.id, { title: 'A', lyrics: 'x' })
    assert.equal(after.updated_at, '2000-01-01 00:00:00')
    const changed = d.updateSong(s.id, { lyrics: 'y' })
    assert.notEqual(changed.updated_at, '2000-01-01 00:00:00')
  })
  it('lista nie zawiera kolumn wyszukiwania', () => {
    const d = mem()
    d.createSong({ title: 'A' })
    assert.equal('search_text' in d.listSongs()[0], false)
  })
  it('usunięcie utworu zwraca nazwy plików nagrań i kasuje powiązane dane', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    d.addVoiceNote(s.id, 'a.webm', 'n1', 1)
    d.addVoiceNote(s.id, 'b.webm', 'n2', 2)
    d.createVersion(s.id, 'v')
    assert.deepEqual(d.deleteSong(s.id).sort(), ['a.webm', 'b.webm'])
    assert.equal(d.listVoiceNotes(s.id).length, 0)
    assert.equal(d.listVersions(s.id).length, 0)
  })
})

describe('wersje', () => {
  it('kolejność przy tej samej sekundzie: najnowsza pierwsza (regresja)', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    for (const l of ['v1', 'v2', 'v3']) d.createVersion(s.id, l)
    assert.deepEqual(d.listVersions(s.id).map((v) => v.label), ['v3', 'v2', 'v1'])
  })
  it('zapisuje i przywraca tonację razem z akordami', () => {
    const d = mem()
    const s = d.createSong({ title: 'A', key: 'Am', chords: '[Am]x' })
    const v = d.createVersion(s.id, 'przed', 'auto')
    d.updateSong(s.id, { key: 'Bm', chords: '[Bm]x' })
    const back = d.restoreVersion(v.id)
    assert.equal(back.key, 'Am')
    assert.equal(back.chords, '[Am]x')
  })
  it('automatyczne migawki są przycinane do 20, ręczne nietknięte', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    d.createVersion(s.id, 'ręczna', 'manual')
    for (let i = 0; i < 25; i++) d.createVersion(s.id, 'auto ' + i, 'auto')
    const all = d.listVersions(s.id)
    assert.equal(all.filter((v) => v.kind === 'auto').length, 20)
    assert.equal(all.filter((v) => v.kind === 'manual').length, 1)
    assert.equal(all[0].label, 'auto 24')
  })
})

describe('nagrania', () => {
  it('zapisuje wyłącznie nazwę pliku, także gdy podano ścieżkę (regresja)', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    const n = d.addVoiceNote(s.id, 'C:\\Users\\ktos\\Dokumenty\\wazny.docx', 't', 1)
    assert.equal(n.file_path, 'wazny.docx')
    assert.equal(d.addVoiceNote(s.id, '../../etc/passwd', 't', 1).file_path, 'passwd')
  })
  it('znaczniki są walidowane, sortowane i ograniczane', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    const n = d.addVoiceNote(s.id, 'a.webm', 't', 10)
    const up = d.updateVoiceNote(n.id, {
      title: 'Nowa nazwa',
      markers: [
        { t: 5, label: 'refren' },
        { t: -3, label: 'start' },
        { t: Number.NaN, label: 'zły' },
        { t: 1, label: 'x'.repeat(200) }
      ]
    })
    assert.equal(up.title, 'Nowa nazwa')
    assert.deepEqual(up.markers.map((m) => m.t), [0, 1, 5])
    assert.equal(up.markers[1].label.length, 80)
  })
})

describe('setlisty', () => {
  it('dodaje, przestawia, usuwa i numeruje pozycje', () => {
    const d = mem()
    const [a, b, c] = ['A', 'B', 'C'].map((t) => d.createSong({ title: t }))
    const sl = d.createSetlist('  Koncert  ')
    assert.equal(sl.name, 'Koncert')
    for (const s of [a, b, c]) d.addToSetlist(sl.id, s.id)
    d.addToSetlist(sl.id, a.id) // duplikat ignorowany
    let items = d.getSetlist(sl.id)!.items
    assert.deepEqual(items.map((i) => i.title), ['A', 'B', 'C'])

    d.moveSetlistItem(items[2].id, -1)
    items = d.getSetlist(sl.id)!.items
    assert.deepEqual(items.map((i) => i.title), ['A', 'C', 'B'])
    d.moveSetlistItem(items[0].id, -1) // na początku — bez zmian
    d.moveSetlistItem(items[2].id, 1) // na końcu — bez zmian
    assert.deepEqual(d.getSetlist(sl.id)!.items.map((i) => i.title), ['A', 'C', 'B'])

    d.removeFromSetlist(items[1].id)
    items = d.getSetlist(sl.id)!.items
    assert.deepEqual(items.map((i) => [i.title, i.position]), [['A', 0], ['B', 1]])
    assert.equal(d.listSetlists()[0].item_count, 2)
  })
  it('ogranicza transpozycję i kasuje pozycje razem z utworem', () => {
    const d = mem()
    const s = d.createSong({ title: 'A' })
    const sl = d.createSetlist('X')
    d.addToSetlist(sl.id, s.id)
    const item = d.getSetlist(sl.id)!.items[0]
    d.setItemTranspose(item.id, 99)
    assert.equal(d.getSetlist(sl.id)!.items[0].transpose, 11)
    d.setItemTranspose(item.id, -99)
    assert.equal(d.getSetlist(sl.id)!.items[0].transpose, -11)
    d.deleteSong(s.id)
    assert.equal(d.getSetlist(sl.id)!.items.length, 0)
    d.deleteSetlist(sl.id)
    assert.equal(d.getSetlist(sl.id), undefined)
  })
})

describe('migracja starej bazy (1.0.x → bieżący schemat)', () => {
  const legacyPath = (): string => join(dir, 'stara-' + Math.random().toString(36).slice(2) + '.db')

  function makeLegacy(path: string): void {
    // dokładnie schemat z wersji 1.0.x: FTS5 + wyzwalacze, ścieżki bezwzględne w nagraniach
    const old = new Database(path)
    old.pragma('journal_mode = WAL')
    old.pragma('foreign_keys = ON')
    old.exec(`
      CREATE TABLE songs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '', lyrics TEXT NOT NULL DEFAULT '', chords TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE versions (id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL, lyrics TEXT NOT NULL DEFAULT '',
        chords TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE);
      CREATE TABLE voice_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, song_id INTEGER NOT NULL, file_path TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', duration REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
      CREATE VIRTUAL TABLE songs_fts USING fts5(title, artist, tags, lyrics, chords, notes, content='songs', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2');
      CREATE TRIGGER songs_ai AFTER INSERT ON songs BEGIN
        INSERT INTO songs_fts(rowid, title, artist, tags, lyrics, chords, notes)
        VALUES (new.id, new.title, new.artist, new.tags, new.lyrics, new.chords, new.notes); END;
      CREATE TRIGGER songs_au AFTER UPDATE ON songs BEGIN
        INSERT INTO songs_fts(songs_fts, rowid, title, artist, tags, lyrics, chords, notes)
        VALUES ('delete', old.id, old.title, old.artist, old.tags, old.lyrics, old.chords, old.notes);
        INSERT INTO songs_fts(rowid, title, artist, tags, lyrics, chords, notes)
        VALUES (new.id, new.title, new.artist, new.tags, new.lyrics, new.chords, new.notes); END;
    `)
    old.prepare('INSERT INTO songs (title, lyrics, chords) VALUES (?, ?, ?)').run('Światła miasta', 'Idę przez ulice', '[Am]Idę')
    old.prepare('INSERT INTO versions (song_id, lyrics, chords, label) VALUES (1, ?, ?, ?)').run('stary tekst', '', 'v0')
    old.prepare('INSERT INTO voice_notes (song_id, file_path, title, duration) VALUES (1, ?, ?, 3)').run(
      'C:\\Users\\Marek\\AppData\\Roaming\\songbook-studio\\voice-notes\\abc-123.webm',
      'melodia'
    )
    old.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'dark')").run()
    old.close()
  }

  it('zachowuje dane, dokłada kolumny, usuwa FTS i ustawia wersję schematu', () => {
    const p = legacyPath()
    makeLegacy(p)
    const d = new SongbookDb(p)
    assert.equal(Number(d.raw.pragma('user_version', { simple: true })), SCHEMA_VERSION)
    assert.equal(d.listSongs()[0].title, 'Światła miasta')
    assert.equal(d.listSongs()[0].suno_style, '')
    assert.equal(d.getSetting('theme'), 'dark')
    // FTS i wyzwalacze zniknęły — inaczej UPDATE rzuciłby błąd
    assert.equal(
      (d.raw.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE name LIKE 'songs_%'").get() as { c: number }).c,
      0
    )
    d.updateSong(1, { lyrics: 'nowy' })
    // stara wersja dostała domyślny rodzaj i brak tonacji
    const v = d.listVersions(1)[0]
    assert.equal(v.kind, 'manual')
    assert.equal(v.song_key, null)
    d.close()
  })

  it('wyszukiwanie działa na danych sprzed migracji (backfill)', () => {
    const p = legacyPath()
    makeLegacy(p)
    const d = new SongbookDb(p)
    assert.equal(d.searchSongs('swiatla').length, 1)
    assert.equal(d.searchSongs('ulice').length, 1)
    d.close()
  })

  it('zamienia ścieżki nagrań na same nazwy plików (regresja bezpieczeństwa)', () => {
    const p = legacyPath()
    makeLegacy(p)
    const d = new SongbookDb(p)
    assert.equal(d.listVoiceNotes(1)[0].file_path, 'abc-123.webm')
    assert.deepEqual(d.listVoiceNotes(1)[0].markers, [])
    d.close()
  })

  it('robi kopię pliku przed migracją i jest idempotentna', () => {
    const p = legacyPath()
    makeLegacy(p)
    new SongbookDb(p).close()
    assert.ok(existsSync(`${p}.pre-v${SCHEMA_VERSION}.bak`))
    const again = new SongbookDb(p) // drugie otwarcie nie migruje ponownie ani nie psuje danych
    assert.equal(again.listSongs().length, 1)
    again.close()
  })

  it('odmawia otwarcia bazy z nowszej wersji aplikacji', () => {
    const p = legacyPath()
    new SongbookDb(p).close()
    const raw = new Database(p)
    raw.pragma('user_version = 99')
    raw.close()
    assert.throws(() => new SongbookDb(p), (e) => e instanceof SchemaTooNewError)
  })
})

describe('inspect', () => {
  it('rozpoznaje poprawną bazę, obcą bazę i brak pliku', () => {
    const good = join(dir, 'dobra.db')
    const d = new SongbookDb(good)
    d.createSong({ title: 'A' })
    d.close()
    assert.deepEqual(SongbookDb.inspect(good), { ok: true, schema: SCHEMA_VERSION, songs: 1 })

    const foreign = join(dir, 'obca.db')
    const f = new Database(foreign)
    f.exec('CREATE TABLE cos (x)')
    f.close()
    assert.equal(SongbookDb.inspect(foreign).ok, false)
    assert.equal(SongbookDb.inspect(join(dir, 'nie-ma.db')).ok, false)
  })
})

describe('swapDatabaseFile (przywracanie)', () => {
  function makeDb(name: string, title: string): string {
    const p = join(dir, name)
    const d = new SongbookDb(p)
    d.createSong({ title })
    d.close()
    return p
  }

  it('podmienia bazę i sprząta kopię awaryjną', () => {
    const live = makeDb('live1.db', 'obecna')
    const src = makeDb('src1.db', 'z kopii')
    let opened: SongbookDb | null = null
    swapDatabaseFile(live, src, { close: () => opened?.close(), open: () => (opened = new SongbookDb(live)) })
    assert.equal(opened!.listSongs()[0].title, 'z kopii')
    assert.equal(existsSync(live + '.restore-bak'), false)
    opened!.close()
  })

  it('przy błędzie otwarcia przywraca poprzednią bazę (regresja: brak bazy po nieudanym przywracaniu)', () => {
    const live = makeDb('live2.db', 'moje piosenki')
    const src = makeDb('src2.db', 'z kopii')
    let calls = 0
    let opened: SongbookDb | null = null
    assert.throws(
      () =>
        swapDatabaseFile(live, src, {
          close: () => opened?.close(),
          open: () => {
            calls++
            if (calls === 1) throw new Error('nie da się otworzyć')
            opened = new SongbookDb(live)
          }
        }),
      /nie da się otworzyć/
    )
    assert.equal(calls, 2)
    assert.equal(opened!.listSongs()[0].title, 'moje piosenki')
    opened!.close()
  })

  it('przy braku pliku źródłowego nie niszczy bieżącej bazy', () => {
    const live = makeDb('live3.db', 'moje piosenki')
    let opened: SongbookDb | null = null
    assert.throws(() =>
      swapDatabaseFile(live, join(dir, 'nie-ma.db'), {
        close: () => opened?.close(),
        open: () => (opened = new SongbookDb(live))
      })
    )
    assert.equal(opened!.listSongs()[0].title, 'moje piosenki')
    assert.equal(readFileSync(live).length > 0, true)
    opened!.close()
  })
})

describe('klucze API', () => {
  it('są szyfrowane i odszyfrowywane przez kodek, a migracja doszyfrowuje stare', () => {
    const codec = {
      isSecret: (k: string) => k === 'gemini_api_key',
      isEncrypted: (v: string) => v.startsWith('enc:'),
      encrypt: (v: string) => 'enc:' + Buffer.from(v).toString('base64'),
      decrypt: (v: string) => (v.startsWith('enc:') ? Buffer.from(v.slice(4), 'base64').toString() : v)
    }
    const d = new SongbookDb(':memory:', codec)
    d.setSetting('gemini_api_key', 'tajny')
    const raw = d.raw.prepare("SELECT value FROM settings WHERE key='gemini_api_key'").get() as { value: string }
    assert.ok(raw.value.startsWith('enc:') && !raw.value.includes('tajny'))
    assert.equal(d.getSetting('gemini_api_key'), 'tajny')
    assert.equal(d.getAllSettings().gemini_api_key, 'tajny')

    d.raw.prepare("UPDATE settings SET value='jawny' WHERE key='gemini_api_key'").run()
    d.migrateSecrets()
    assert.ok((d.raw.prepare("SELECT value FROM settings WHERE key='gemini_api_key'").get() as { value: string }).value.startsWith('enc:'))
    assert.equal(d.getSetting('gemini_api_key'), 'jawny')
  })
})

void writeFileSync
