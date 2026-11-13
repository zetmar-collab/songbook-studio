import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync } from 'fs'
import { mkdir, unlink, writeFile } from 'fs/promises'
import { isAbsolute } from 'path'
import { transposeKey, transposeText } from '../shared/chords'
import type { ExportFormat, Lang, SingleExportFormat, VersionKind } from '../shared/types'
import { generateChords, fetchOpenRouterFreeModels, testAiConnection } from './ai'
import { createFullBackup, restoreBackup } from './backup'
import { backupsDir, getDb, setSetting, voiceFilePath } from './db'
import { exportCollection, exportSong, type ExportSong } from './export'
import { strings } from './exportStrings'
import { IMPORT_EXTENSIONS, importFiles } from './import'
import {
  asInt,
  asMarkers,
  asSettingKey,
  asSettingValue,
  asSongPatch,
  asString,
  oneOf
} from './validate'

const MAX_VOICE_BYTES = 200 * 1024 * 1024
const MAX_IMPORT_FILES = 200
const REPORT_EMAIL = 'zetmar@gmail.com'
const REPORT_CONTENT_LIMIT = 1200

const parent = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? undefined

function showSave(options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  const win = parent()
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}

function showOpen(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  const win = parent()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

const asLang = (v: unknown): Lang => oneOf(v ?? 'pl', ['pl', 'en'] as const, 'język')

const safeFileName = (s: string, fallback: string): string =>
  (s || fallback).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)

async function removeVoiceFiles(names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await unlink(voiceFilePath(name))
    } catch {
      // plik mógł już nie istnieć
    }
  }
}

function exportFilters(format: SingleExportFormat): Electron.FileFilter[] {
  if (format === 'pdf') return [{ name: 'PDF', extensions: ['pdf'] }]
  if (format === 'docx') return [{ name: 'Word', extensions: ['docx'] }]
  if (format === 'cho') return [{ name: 'ChordPro', extensions: ['cho'] }]
  return [{ name: 'Markdown', extensions: ['md'] }]
}

export function registerIpc(): void {
  const db = (): ReturnType<typeof getDb> => getDb()

  // ----- Piosenki -----
  ipcMain.handle('songs:list', () => db().listSongs())
  ipcMain.handle('songs:get', (_e, id) => db().getSong(asInt(id)))
  ipcMain.handle('songs:create', (_e, partial) => db().createSong(asSongPatch(partial ?? {})))
  ipcMain.handle('songs:update', (_e, id, patch) => db().updateSong(asInt(id), asSongPatch(patch)))
  ipcMain.handle('songs:delete', async (_e, id) => {
    await removeVoiceFiles(db().deleteSong(asInt(id)))
  })
  ipcMain.handle('songs:search', (_e, query) => db().searchSongs(asString(query, 500, 'zapytanie')))

  // ----- Wersje -----
  ipcMain.handle('versions:list', (_e, songId) => db().listVersions(asInt(songId)))
  ipcMain.handle('versions:create', (_e, songId, label, kind) =>
    db().createVersion(
      asInt(songId),
      asString(label, 200, 'etykieta'),
      oneOf<VersionKind>(kind ?? 'manual', ['manual', 'auto'], 'rodzaj wersji')
    )
  )
  ipcMain.handle('versions:restore', (_e, versionId) => db().restoreVersion(asInt(versionId)))
  ipcMain.handle('versions:delete', (_e, versionId) => db().deleteVersion(asInt(versionId)))

  // ----- Nagrania głosowe (odtwarzanie przez protokół sbvoice://, patrz index.ts) -----
  ipcMain.handle('voice:list', (_e, songId) => db().listVoiceNotes(asInt(songId)))
  ipcMain.handle('voice:save', async (_e, songId, buffer, title, duration) => {
    const id = asInt(songId)
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0 || buffer.byteLength > MAX_VOICE_BYTES) {
      throw new Error('Nieprawidłowe nagranie.')
    }
    const name = `${randomUUID()}.webm`
    const full = voiceFilePath(name)
    await mkdir(app.getPath('userData') + '/voice-notes', { recursive: true })
    await writeFile(full, Buffer.from(buffer))
    try {
      return db().addVoiceNote(id, name, asString(title, 200, 'tytuł'), Number(duration) || 0)
    } catch (e) {
      await unlink(full).catch(() => {})
      throw e
    }
  })
  ipcMain.handle('voice:update', (_e, id, patch) => {
    const p = (patch ?? {}) as Record<string, unknown>
    return db().updateVoiceNote(asInt(id), {
      title: p.title === undefined ? undefined : asString(p.title, 200, 'tytuł'),
      note: p.note === undefined ? undefined : asString(p.note, 2000, 'opis'),
      markers: p.markers === undefined ? undefined : asMarkers(p.markers)
    })
  })
  ipcMain.handle('voice:delete', async (_e, id) => {
    const note = db().deleteVoiceNote(asInt(id))
    if (note) await removeVoiceFiles([note.file_path])
  })

  // ----- Setlisty -----
  ipcMain.handle('setlists:list', () => db().listSetlists())
  ipcMain.handle('setlists:get', (_e, id) => db().getSetlist(asInt(id)))
  ipcMain.handle('setlists:create', (_e, name) => db().createSetlist(asString(name, 120, 'nazwa')))
  ipcMain.handle('setlists:rename', (_e, id, name) => db().renameSetlist(asInt(id), asString(name, 120, 'nazwa')))
  ipcMain.handle('setlists:delete', (_e, id) => db().deleteSetlist(asInt(id)))
  ipcMain.handle('setlists:add', (_e, setlistId, songId) => db().addToSetlist(asInt(setlistId), asInt(songId)))
  ipcMain.handle('setlists:remove', (_e, itemId) => db().removeFromSetlist(asInt(itemId)))
  ipcMain.handle('setlists:move', (_e, itemId, dir) =>
    db().moveSetlistItem(asInt(itemId), dir === -1 ? -1 : 1)
  )
  ipcMain.handle('setlists:setTranspose', (_e, itemId, semitones) =>
    db().setItemTranspose(asInt(itemId), asInt(semitones, 'półtony'))
  )

  // ----- AI -----
  ipcMain.handle('ai:generateChords', (_e, req) => {
    const r = (req ?? {}) as Record<string, unknown>
    return generateChords({
      title: asString(r.title ?? '', 300, 'tytuł'),
      artist: asString(r.artist ?? '', 300, 'wykonawca'),
      key: asString(r.key ?? '', 40, 'tonacja'),
      lyrics: asString(r.lyrics ?? '', 100_000, 'tekst'),
      language: asLang(r.language)
    })
  })
  ipcMain.handle('ai:test', () => testAiConnection())
  ipcMain.handle('ai:openrouterModels', () => fetchOpenRouterFreeModels())

  // ----- Ustawienia i motyw -----
  ipcMain.handle('settings:getAll', () => db().getAllSettings())
  ipcMain.handle('settings:set', (_e, key, value) => {
    const k = asSettingKey(key)
    setSetting(k, asSettingValue(k, value))
  })
  ipcMain.handle('theme:set', (_e, theme) => {
    const t = oneOf(theme, ['system', 'light', 'dark'] as const, 'motyw')
    nativeTheme.themeSource = t
    setSetting('theme', t)
    return nativeTheme.shouldUseDarkColors
  })
  ipcMain.handle('theme:current', () => ({
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors
  }))

  // ----- Eksport -----
  ipcMain.handle('export:song', async (_e, songId, format, lang) => {
    const song = db().getSong(asInt(songId))
    if (!song) throw new Error('Nie znaleziono utworu')
    const fmt = oneOf<SingleExportFormat>(format, ['pdf', 'docx', 'md', 'cho'], 'format')
    const l = asLang(lang)
    const base = safeFileName(song.title, strings(l).untitled)
    const res = await showSave({ defaultPath: `${base}.${fmt}`, filters: exportFilters(fmt) })
    if (res.canceled || !res.filePath) return { canceled: true }
    await exportSong(song, fmt, res.filePath, l)
    return { canceled: false, filePath: res.filePath }
  })

  ipcMain.handle('export:all', async (_e, format, lang) => {
    const songs = db().listSongs()
    if (songs.length === 0) return { canceled: true, empty: true }
    const fmt = oneOf<ExportFormat>(format, ['pdf', 'docx', 'md'], 'format')
    const l = asLang(lang)
    const title = strings(l).songbook
    const stamp = new Date().toISOString().slice(0, 10)
    const res = await showSave({ defaultPath: `${title}-${stamp}.${fmt}`, filters: exportFilters(fmt) })
    if (res.canceled || !res.filePath) return { canceled: true }
    await exportCollection(songs, title, fmt, res.filePath, l)
    return { canceled: false, filePath: res.filePath, count: songs.length }
  })

  ipcMain.handle('export:setlist', async (_e, setlistId, format, lang) => {
    const detail = db().getSetlist(asInt(setlistId))
    if (!detail) throw new Error('Nie znaleziono setlisty')
    if (detail.items.length === 0) return { canceled: true, empty: true }
    const fmt = oneOf<ExportFormat>(format, ['pdf', 'docx', 'md'], 'format')
    const l = asLang(lang)
    const songs: ExportSong[] = detail.items.map((i) => {
      const targetKey = transposeKey(i.key, i.transpose)
      return {
        title: i.title,
        artist: i.artist,
        key: i.transpose ? targetKey : i.key,
        tags: '',
        notes: '',
        lyrics: i.lyrics,
        chords: transposeText(i.chords, i.transpose, { targetKey: i.key ? targetKey : null })
      }
    })
    const name = detail.setlist.name || strings(l).songbook
    const res = await showSave({
      defaultPath: `${safeFileName(name, 'setlista')}.${fmt}`,
      filters: exportFilters(fmt)
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    await exportCollection(songs, name, fmt, res.filePath, l)
    return { canceled: false, filePath: res.filePath, count: songs.length }
  })

  ipcMain.handle('shell:showItem', (_e, filePath) => {
    const p = asString(filePath, 1000, 'ścieżka')
    if (isAbsolute(p) && existsSync(p)) shell.showItemInFolder(p)
  })

  // ----- Import plików (docx, txt, ChordPro) -----
  ipcMain.handle('import:files', async () => {
    const res = await showOpen({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Teksty i akordy', extensions: IMPORT_EXTENSIONS },
        { name: 'Word', extensions: ['docx'] },
        { name: 'ChordPro', extensions: ['cho', 'chordpro', 'pro'] },
        { name: 'Tekst', extensions: ['txt', 'md', 'crd'] }
      ]
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    const imported = await importFiles(res.filePaths.slice(0, MAX_IMPORT_FILES))
    const songs = imported.items.map(({ song }) =>
      db().createSong({
        title: song.title.slice(0, 300),
        artist: song.artist.slice(0, 300),
        key: song.key.slice(0, 40),
        notes: song.notes.slice(0, 200_000),
        lyrics: song.lyrics.slice(0, 300_000),
        chords: song.chords.slice(0, 300_000)
      })
    )
    return { canceled: false, songs, failed: imported.failed }
  })

  // ----- Kopie zapasowe -----
  ipcMain.handle('backup:create', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const res = await showSave({
      defaultPath: `Songbook-Studio-kopia-${stamp}.zip`,
      filters: [{ name: 'Kopia Songbook Studio (baza + nagrania)', extensions: ['zip'] }]
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    const summary = await createFullBackup(res.filePath)
    return { canceled: false, filePath: res.filePath, ...summary }
  })

  ipcMain.handle('backup:restore', async () => {
    const res = await showOpen({
      properties: ['openFile'],
      filters: [{ name: 'Kopia Songbook Studio', extensions: ['zip', 'db'] }]
    })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    return { canceled: false, ...restoreBackup(res.filePaths[0]) }
  })

  ipcMain.handle('backup:openFolder', async () => {
    const dir = backupsDir()
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle('backup:chooseDir', async () => {
    const res = await showOpen({ properties: ['openDirectory', 'createDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return { canceled: true }
    setSetting('backup_dir', res.filePaths[0])
    return { canceled: false, dir: res.filePaths[0] }
  })

  ipcMain.handle('backup:resetDir', () => {
    setSetting('backup_dir', '')
    return backupsDir()
  })

  // ----- Schowek -----
  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(asString(text, 300_000, 'tekst'))
  })

  // ----- Zgłaszanie nieodpowiednich treści AI (polityka Sklepu Microsoft 11.16) -----
  // Adres budowany jest tutaj, a nie w rendererze — renderer nie może otworzyć dowolnego URL-a.
  ipcMain.handle('report:ai', async (_e, payload) => {
    const p = (payload ?? {}) as Record<string, unknown>
    const content = asString(p.content ?? '', 300_000, 'treść')
    const build = (body: string): string =>
      [
        'Zgloszenie nieodpowiedniej tresci wygenerowanej przez AI',
        '(AI-generated content report)',
        '',
        `Aplikacja / App: Songbook Studio ${app.getVersion()}`,
        `Dostawca / Provider: ${asString(p.provider ?? '', 100, 'dostawca') || '(nieznany)'}`,
        `Model: ${asString(p.model ?? '', 200, 'model') || '(nieznany)'}`,
        '',
        'Opis problemu / Problem description:',
        asString(p.description ?? '', 5000, 'opis') || '(nie podano)',
        '',
        'Zgloszona tresc / Reported content:',
        body || '(brak)'
      ].join('\n')

    // Pełna treść zawsze trafia do schowka; w adresie mailto: jest tylko jej początek,
    // bo długie adresy bywają ucinane lub odrzucane przez systemowy program pocztowy.
    clipboard.writeText(build(content))
    const truncated = content.length > REPORT_CONTENT_LIMIT
    const short = truncated ? content.slice(0, REPORT_CONTENT_LIMIT) + '\n[…skrocono / truncated…]' : content
    const url =
      `mailto:${REPORT_EMAIL}?subject=` +
      encodeURIComponent('Songbook Studio — zgloszenie tresci AI / AI content report') +
      '&body=' +
      encodeURIComponent(build(short))
    try {
      await shell.openExternal(url)
    } catch {
      throw new Error('Nie udało się otworzyć programu pocztowego. Pełna treść zgłoszenia jest w schowku.')
    }
    return { ok: true, truncated }
  })

  ipcMain.handle('report:issues', async () => {
    await shell.openExternal('https://github.com/zetmar-collab/songbook-studio/issues/new')
    return { ok: true }
  })
}
