// Pełna kopia zapasowa (ZIP: baza + nagrania) i przywracanie z kopii ZIP lub samej bazy (.db).
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { SCHEMA_VERSION, SongbookDb } from './database'
import { getDb, isSafeVoiceName, restoreDbFile, voiceDir, voiceFilePath } from './db'
import { readZip, writeZip, type ZipEntry } from './zip'

const MAX_BACKUP_BYTES = 1536 * 1024 * 1024

export interface BackupSummary {
  songs: number
  voiceFiles: number
}

function tempFile(ext: string): string {
  return join(app.getPath('temp'), `songbook-${randomUUID()}${ext}`)
}

/** Zapisuje ZIP z bazą, manifestem i wszystkimi nagraniami. */
export async function createFullBackup(destZip: string): Promise<BackupSummary> {
  const db = getDb()
  const tmp = tempFile('.db')
  try {
    await db.backupTo(tmp)
    const dbBuf = readFileSync(tmp)

    const entries: ZipEntry[] = []
    let total = dbBuf.length
    let voiceFiles = 0
    const dir = voiceDir()
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) {
        if (!isSafeVoiceName(name)) continue
        const data = readFileSync(voiceFilePath(name))
        total += data.length
        if (total > MAX_BACKUP_BYTES) {
          throw new Error('Nagrania są zbyt duże na jedną kopię ZIP (limit ok. 1,5 GB).')
        }
        entries.push({ name: `voice-notes/${name}`, data })
        voiceFiles++
      }
    }

    const songs = db.listSongs().length
    const manifest = {
      app: 'songbook-studio',
      version: app.getVersion(),
      schema: SCHEMA_VERSION,
      created: new Date().toISOString(),
      songs,
      voiceFiles
    }
    const zip = writeZip([
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
      { name: 'songbook.db', data: dbBuf },
      ...entries
    ])
    mkdirSync(join(destZip, '..'), { recursive: true })
    writeFileSync(destZip, zip)
    return { songs, voiceFiles }
  } finally {
    rmSync(tmp, { force: true })
  }
}

/** Przywraca kopię w formacie ZIP (baza + nagrania) albo samą bazę (.db). */
export function restoreBackup(srcPath: string): BackupSummary {
  if (extname(srcPath).toLowerCase() !== '.zip') {
    const { songs } = restoreDbFile(srcPath)
    return { songs, voiceFiles: 0 }
  }

  const buf = readFileSync(srcPath)
  const entries = readZip(buf, { maxEntryBytes: MAX_BACKUP_BYTES, maxTotalBytes: MAX_BACKUP_BYTES })
  const dbEntry = entries.find((e) => e.name === 'songbook.db')
  if (!dbEntry) throw new Error('To archiwum nie zawiera bazy Songbook Studio (songbook.db).')

  const tmp = tempFile('.db')
  try {
    writeFileSync(tmp, dbEntry.data)
    // walidacja bazy PRZED zapisem czegokolwiek na dysku użytkownika
    const info = SongbookDb.inspect(tmp)
    if (!info.ok) throw new Error(info.error ?? 'Nieprawidłowa baza w archiwum.')

    mkdirSync(voiceDir(), { recursive: true })
    let voiceFiles = 0
    for (const e of entries) {
      if (!e.name.startsWith('voice-notes/')) continue
      const name = e.name.slice('voice-notes/'.length)
      if (!isSafeVoiceName(name) || !name.toLowerCase().endsWith('.webm')) continue
      writeFileSync(voiceFilePath(name), e.data)
      voiceFiles++
    }
    const { songs } = restoreDbFile(tmp)
    return { songs, voiceFiles }
  } finally {
    rmSync(tmp, { force: true })
  }
}
