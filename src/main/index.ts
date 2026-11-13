import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { pathToFileURL } from 'url'
import { SchemaTooNewError } from './database'
import { autoBackup, closeDb, getDb, getSetting, initDb, voiceFilePath } from './db'
import { registerIpc } from './ipc'
import { initUpdater } from './updater'

// Nagrania głosowe są serwowane przez własny protokół (sbvoice://note/<id>) — renderer nigdy
// nie dostaje ścieżek plików, a nazwy plików pochodzą wyłącznie z bazy.
protocol.registerSchemesAsPrivileged([
  { scheme: 'sbvoice', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
])

// Jedna instancja aplikacji — dwa procesy na tej samej bazie SQLite to proszenie się o kłopoty.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let updaterReady = false
let mainWindow: BrowserWindow | null = null
let flushed = false

function resolveIcon(): string | undefined {
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function createWindow(): void {
  const savedTheme = getSetting('theme') || 'system'
  nativeTheme.themeSource = (['system', 'light', 'dark'].includes(savedTheme)
    ? savedTheme
    : 'system') as 'system' | 'light' | 'dark'

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Songbook Studio',
    icon: resolveIcon(),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win
  flushed = false

  win.on('ready-to-show', () => win.show())

  // Przy zamykaniu renderer dostaje szansę zapisania niezapisanych zmian (maks. 1,5 s).
  win.on('close', (e) => {
    if (flushed || win.isDestroyed()) return
    e.preventDefault()
    flushed = true
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      ipcMain.removeListener('app:flushDone', finish)
      if (!win.isDestroyed()) win.close()
    }
    ipcMain.once('app:flushDone', finish)
    setTimeout(finish, 1500)
    try {
      win.webContents.send('app:flushRequest')
    } catch {
      finish()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (!updaterReady) {
    updaterReady = true
    initUpdater(win)
  }

  win.webContents.setWindowOpenHandler((details) => {
    if (isHttps(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Aplikacja jest pojedynczą stroną — żadna nawigacja poza nią nie jest dozwolona.
  win.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && url.startsWith(dev)) return
    if (url === win.webContents.getURL()) return // przeładowanie tej samej strony (Ctrl+R w trybie deweloperskim)
    e.preventDefault()
    if (isHttps(url)) void shell.openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerVoiceProtocol(): void {
  protocol.handle('sbvoice', async (request) => {
    try {
      const url = new URL(request.url)
      const id = Number(url.pathname.replace(/^\//, ''))
      if (url.hostname !== 'note' || !Number.isInteger(id)) return new Response('Bad request', { status: 400 })
      const note = getDb().getVoiceNote(id)
      if (!note) return new Response('Not found', { status: 404 })
      const file = voiceFilePath(note.file_path)
      if (!existsSync(file)) return new Response('Not found', { status: 404 })
      // Nagłówki (m.in. Range) są przekazywane dalej, dzięki czemu działa przewijanie nagrania.
      return await net.fetch(pathToFileURL(file).toString(), { headers: request.headers })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  try {
    initDb()
  } catch (e) {
    if (e instanceof SchemaTooNewError) {
      dialog.showErrorBox(
        'Songbook Studio',
        'Baza danych pochodzi z nowszej wersji aplikacji. Zaktualizuj Songbook Studio, aby ją otworzyć.\n\n' +
          'Database was created by a newer version of the app. Please update Songbook Studio.'
      )
    } else {
      dialog.showErrorBox(
        'Songbook Studio',
        'Nie udało się otworzyć bazy danych.\n\n' + (e instanceof Error ? e.message : String(e))
      )
    }
    app.exit(1)
    return
  }
  registerVoiceProtocol()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let didBackup = false
app.on('before-quit', () => {
  if (didBackup) return
  didBackup = true
  try {
    if ((getSetting('auto_backup') || 'on') !== 'off') autoBackup(10)
  } catch {
    // kopia nie może blokować zamknięcia
  }
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
