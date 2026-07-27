import { app, ipcMain, BrowserWindow } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

/**
 * Konfiguruje automatyczne aktualizacje.
 * Wymaga skonfigurowanego providera `publish` w electron-builder.yml
 * (patrz README → „Automatyczne aktualizacje").
 * W trybie deweloperskim i bez serwera aktualizacji nie robi nic destrukcyjnego.
 */
export function initUpdater(win: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  const send = (payload: Record<string, unknown>): void => {
    if (!win.isDestroyed()) win.webContents.send('update:status', payload)
  }

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    send({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => send({ state: 'none' }))
  autoUpdater.on('error', (err) => send({ state: 'error', message: String(err?.message ?? err) }))
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'progress', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    send({ state: 'downloaded', version: info.version })
  )

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { state: 'dev' }
    try {
      await autoUpdater.checkForUpdates()
      return { state: 'checking' }
    } catch (e) {
      return { state: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('update:version', () => app.getVersion())

  // Automatyczne sprawdzenie krótko po starcie (tylko w wersji spakowanej)
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {
        /* brak serwera aktualizacji — ignoruj po cichu */
      })
    }, 4000)
  }
}
