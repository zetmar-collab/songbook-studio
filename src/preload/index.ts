import { contextBridge, ipcRenderer } from 'electron'

const api = {
  songs: {
    list: () => ipcRenderer.invoke('songs:list'),
    get: (id: number) => ipcRenderer.invoke('songs:get', id),
    create: (partial: unknown) => ipcRenderer.invoke('songs:create', partial),
    update: (id: number, partial: unknown) => ipcRenderer.invoke('songs:update', id, partial),
    delete: (id: number) => ipcRenderer.invoke('songs:delete', id),
    search: (query: string) => ipcRenderer.invoke('songs:search', query)
  },
  versions: {
    list: (songId: number) => ipcRenderer.invoke('versions:list', songId),
    create: (songId: number, label: string) =>
      ipcRenderer.invoke('versions:create', songId, label),
    restore: (versionId: number) => ipcRenderer.invoke('versions:restore', versionId),
    delete: (versionId: number) => ipcRenderer.invoke('versions:delete', versionId)
  },
  voice: {
    list: (songId: number) => ipcRenderer.invoke('voice:list', songId),
    save: (songId: number, buffer: ArrayBuffer, title: string, duration: number) =>
      ipcRenderer.invoke('voice:save', songId, buffer, title, duration),
    read: (id: number) => ipcRenderer.invoke('voice:read', id),
    delete: (id: number) => ipcRenderer.invoke('voice:delete', id)
  },
  ai: {
    generateChords: (req: unknown) => ipcRenderer.invoke('ai:generateChords', req),
    test: () => ipcRenderer.invoke('ai:test'),
    openrouterModels: (apiKey?: string) =>
      ipcRenderer.invoke('ai:openrouterModels', apiKey)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  theme: {
    set: (theme: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', theme),
    current: () => ipcRenderer.invoke('theme:current')
  },
  export: {
    song: (songId: number, format: 'pdf' | 'docx' | 'md') =>
      ipcRenderer.invoke('export:song', songId, format),
    all: (format: 'pdf' | 'docx' | 'md') => ipcRenderer.invoke('export:all', format)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    version: () => ipcRenderer.invoke('update:version'),
    onStatus: (cb: (payload: Record<string, unknown>) => void) => {
      const listener = (_e: unknown, payload: Record<string, unknown>): void => cb(payload)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    }
  },
  import: {
    docx: () => ipcRenderer.invoke('import:docx')
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    restore: () => ipcRenderer.invoke('backup:restore'),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
    chooseDir: () => ipcRenderer.invoke('backup:chooseDir'),
    resetDir: () => ipcRenderer.invoke('backup:resetDir')
  },
  shell: {
    showItem: (filePath: string) => ipcRenderer.invoke('shell:showItem', filePath)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
