import { app, shell, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { initDb, getSetting, setSetting, autoBackup, closeDb } from './db'
import { registerIpc } from './ipc'
import { initUpdater } from './updater'

let updaterReady = false

function resolveIcon(): string | undefined {
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(process.resourcesPath ?? '', 'icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const savedTheme = getSetting('theme') || 'system'
  nativeTheme.themeSource = savedTheme as 'system' | 'light' | 'dark'

  const mainWindow = new BrowserWindow({
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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  if (!updaterReady) {
    updaterReady = true
    initUpdater(mainWindow)
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDb()
  registerIpc()

  // Reaguj na zmianę motywu z UI
  const { ipcMain } = require('electron')
  ipcMain.handle('theme:set', (_e: unknown, theme: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = theme
    setSetting('theme', theme)
    return nativeTheme.shouldUseDarkColors
  })
  ipcMain.handle('theme:current', () => ({
    source: nativeTheme.themeSource,
    dark: nativeTheme.shouldUseDarkColors
  }))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let didBackup = false
app.on('before-quit', () => {
  if (didBackup) return
  didBackup = true
  if ((getSetting('auto_backup') || 'on') !== 'off') {
    autoBackup(10)
  }
  closeDb()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
