import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { mkdir, writeFile, readFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import * as db from './db'
import { generateChords, testAiConnection, fetchOpenRouterFreeModels } from './ai'
import {
  exportMarkdown,
  exportDocx,
  exportPdf,
  exportAllPdf,
  exportAllDocx,
  exportAllMarkdown
} from './export'
import { importDocxText } from './import'

function voiceDir(): string {
  return join(app.getPath('userData'), 'voice-notes')
}

export function registerIpc(): void {
  // ----- Songs -----
  ipcMain.handle('songs:list', () => db.listSongs())
  ipcMain.handle('songs:get', (_e, id: number) => db.getSong(id))
  ipcMain.handle('songs:create', (_e, partial) => db.createSong(partial))
  ipcMain.handle('songs:update', (_e, id: number, partial) => db.updateSong(id, partial))
  ipcMain.handle('songs:delete', (_e, id: number) => db.deleteSong(id))
  ipcMain.handle('songs:search', (_e, query: string) => db.searchSongs(query))

  // ----- Versions -----
  ipcMain.handle('versions:list', (_e, songId: number) => db.listVersions(songId))
  ipcMain.handle('versions:create', (_e, songId: number, label: string) =>
    db.createVersion(songId, label)
  )
  ipcMain.handle('versions:restore', (_e, versionId: number) => db.restoreVersion(versionId))
  ipcMain.handle('versions:delete', (_e, versionId: number) => db.deleteVersion(versionId))

  // ----- Voice notes -----
  ipcMain.handle('voice:list', (_e, songId: number) => db.listVoiceNotes(songId))
  ipcMain.handle(
    'voice:save',
    async (_e, songId: number, buffer: ArrayBuffer, title: string, duration: number) => {
      await mkdir(voiceDir(), { recursive: true })
      const fileName = `${randomUUID()}.webm`
      const filePath = join(voiceDir(), fileName)
      await writeFile(filePath, Buffer.from(buffer))
      return db.addVoiceNote(songId, filePath, title, duration)
    }
  )
  ipcMain.handle('voice:read', async (_e, id: number) => {
    const note = db.getVoiceNote(id)
    if (!note) throw new Error('Nie znaleziono notatki głosowej')
    const buf = await readFile(note.file_path)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
  ipcMain.handle('voice:delete', async (_e, id: number) => {
    const note = db.deleteVoiceNote(id)
    if (note?.file_path) {
      await unlink(note.file_path).catch(() => {})
    }
  })

  // ----- AI -----
  ipcMain.handle('ai:generateChords', (_e, req) => generateChords(req))
  ipcMain.handle('ai:test', () => testAiConnection())
  ipcMain.handle('ai:openrouterModels', (_e, apiKey?: string) =>
    fetchOpenRouterFreeModels(apiKey)
  )

  // ----- Settings -----
  ipcMain.handle('settings:getAll', () => db.getAllSettings())
  ipcMain.handle('settings:set', (_e, key: string, value: string) => db.setSetting(key, value))

  // ----- Export -----
  ipcMain.handle(
    'export:song',
    async (_e, songId: number, format: 'pdf' | 'docx' | 'md') => {
      const song = db.getSong(songId)
      if (!song) throw new Error('Nie znaleziono utworu')

      const safeName = (song.title || 'utwor').replace(/[\\/:*?"<>|]/g, '_')
      const filters =
        format === 'pdf'
          ? [{ name: 'PDF', extensions: ['pdf'] }]
          : format === 'docx'
            ? [{ name: 'Word', extensions: ['docx'] }]
            : [{ name: 'Markdown', extensions: ['md'] }]

      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const result = win
        ? await dialog.showSaveDialog(win, {
            defaultPath: `${safeName}.${format}`,
            filters
          })
        : await dialog.showSaveDialog({ defaultPath: `${safeName}.${format}`, filters })

      if (result.canceled || !result.filePath) return { canceled: true }

      if (format === 'pdf') await exportPdf(song, result.filePath)
      else if (format === 'docx') await exportDocx(song, result.filePath)
      else await exportMarkdown(song, result.filePath)

      return { canceled: false, filePath: result.filePath }
    }
  )

  ipcMain.handle('shell:showItem', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  // ----- Zglaszanie nieodpowiednich tresci wygenerowanych przez AI -----
  // Wymagane przez polityke Sklepu Microsoft 11.16 (Live Generative AI Content).
  // Adres budowany jest tutaj, a nie w rendererze — renderer nie moze otworzyc
  // dowolnego URL-a, przekazuje wylacznie tresc zgloszenia.
  ipcMain.handle(
    'report:ai',
    async (
      _e,
      payload: { description: string; content: string; provider: string; model: string }
    ) => {
      const lines = [
        'Zgloszenie nieodpowiedniej tresci wygenerowanej przez AI',
        '(AI-generated content report)',
        '',
        `Aplikacja / App: Songbook Studio ${app.getVersion()}`,
        `Dostawca / Provider: ${payload.provider || '(nieznany)'}`,
        `Model: ${payload.model || '(nieznany)'}`,
        '',
        'Opis problemu / Problem description:',
        payload.description || '(nie podano)',
        '',
        'Zgloszona tresc / Reported content:',
        payload.content || '(brak)'
      ]
      const url =
        'mailto:zetmar@gmail.com' +
        '?subject=' +
        encodeURIComponent('Songbook Studio — zgloszenie tresci AI / AI content report') +
        '&body=' +
        encodeURIComponent(lines.join('\n'))
      await shell.openExternal(url)
      return { ok: true }
    }
  )

  /** Alternatywny kanal zgloszenia — publiczny tracker projektu. */
  ipcMain.handle('report:issues', async () => {
    await shell.openExternal('https://github.com/zetmar-collab/songbook-studio/issues/new')
    return { ok: true }
  })

  // ----- Eksport zbiorczy całego katalogu -----
  ipcMain.handle('export:all', async (_e, format: 'pdf' | 'docx' | 'md') => {
    const songs = db.listSongs()
    if (songs.length === 0) return { canceled: true, empty: true }

    const stamp = new Date().toISOString().slice(0, 10)
    const filters =
      format === 'pdf'
        ? [{ name: 'PDF', extensions: ['pdf'] }]
        : format === 'docx'
          ? [{ name: 'Word', extensions: ['docx'] }]
          : [{ name: 'Markdown', extensions: ['md'] }]

    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts = { defaultPath: `Spiewnik-${stamp}.${format}`, filters }
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return { canceled: true }

    if (format === 'pdf') await exportAllPdf(songs, result.filePath)
    else if (format === 'docx') await exportAllDocx(songs, result.filePath)
    else await exportAllMarkdown(songs, result.filePath)

    return { canceled: false, filePath: result.filePath, count: songs.length }
  })

  // ----- Kopie zapasowe -----
  ipcMain.handle('backup:create', async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts = {
      defaultPath: `songbook-backup-${stamp}.db`,
      filters: [{ name: 'Kopia bazy SQLite', extensions: ['db'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return { canceled: true }
    await db.backupTo(result.filePath)
    return { canceled: false, filePath: result.filePath }
  })

  ipcMain.handle('backup:restore', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts = {
      properties: ['openFile' as const],
      filters: [{ name: 'Kopia bazy SQLite', extensions: ['db'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    db.restoreFrom(result.filePaths[0])
    return { canceled: false }
  })

  ipcMain.handle('backup:openFolder', () => {
    const dir = db.backupsDir()
    require('fs').mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
  })

  ipcMain.handle('backup:chooseDir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts = { properties: ['openDirectory' as const, 'createDirectory' as const] }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    db.setSetting('backup_dir', result.filePaths[0])
    return { canceled: false, dir: result.filePaths[0] }
  })

  ipcMain.handle('backup:resetDir', () => {
    db.setSetting('backup_dir', '')
    return db.backupsDir()
  })

  // ----- Import z Worda (.docx) -----
  ipcMain.handle('import:docx', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts = {
      properties: ['openFile' as const],
      filters: [{ name: 'Word', extensions: ['docx'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    const { title, text } = await importDocxText(result.filePaths[0])
    const song = db.createSong({ title, lyrics: text })
    return { canceled: false, song }
  })
}
