import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExportFormat,
  Lang,
  Setlist,
  SetlistDetail,
  Song,
  SongPatch,
  SingleExportFormat,
  Version,
  VersionKind,
  VoiceMarker,
  VoiceNote
} from '../shared/types'

const call = <T = void>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>

export interface FileResult {
  canceled: boolean
  empty?: boolean
  filePath?: string
  count?: number
}

export interface OpenRouterModel {
  id: string
  name: string
  context: number
  maxOutput: number
}

export interface ChordRequest {
  title: string
  artist: string
  key: string
  lyrics: string
  language: Lang
}

export type UpdateStatus = Record<string, unknown>

const api = {
  songs: {
    list: () => call<Song[]>('songs:list'),
    get: (id: number) => call<Song | undefined>('songs:get', id),
    create: (partial: SongPatch) => call<Song>('songs:create', partial),
    update: (id: number, patch: SongPatch) => call<Song>('songs:update', id, patch),
    delete: (id: number) => call('songs:delete', id),
    search: (query: string) => call<Song[]>('songs:search', query)
  },
  versions: {
    list: (songId: number) => call<Version[]>('versions:list', songId),
    create: (songId: number, label: string, kind: VersionKind = 'manual') =>
      call<Version>('versions:create', songId, label, kind),
    restore: (versionId: number) => call<Song>('versions:restore', versionId),
    delete: (versionId: number) => call('versions:delete', versionId)
  },
  voice: {
    list: (songId: number) => call<VoiceNote[]>('voice:list', songId),
    save: (songId: number, buffer: ArrayBuffer, title: string, duration: number) =>
      call<VoiceNote>('voice:save', songId, buffer, title, duration),
    update: (id: number, patch: { title?: string; note?: string; markers?: VoiceMarker[] }) =>
      call<VoiceNote>('voice:update', id, patch),
    delete: (id: number) => call('voice:delete', id),
    url: (id: number) => `sbvoice://note/${id}`
  },
  setlists: {
    list: () => call<Setlist[]>('setlists:list'),
    get: (id: number) => call<SetlistDetail | undefined>('setlists:get', id),
    create: (name: string) => call<Setlist>('setlists:create', name),
    rename: (id: number, name: string) => call('setlists:rename', id, name),
    delete: (id: number) => call('setlists:delete', id),
    add: (setlistId: number, songId: number) => call('setlists:add', setlistId, songId),
    remove: (itemId: number) => call('setlists:remove', itemId),
    move: (itemId: number, dir: -1 | 1) => call('setlists:move', itemId, dir),
    setTranspose: (itemId: number, semitones: number) =>
      call('setlists:setTranspose', itemId, semitones)
  },
  ai: {
    generateChords: (req: ChordRequest) => call<string>('ai:generateChords', req),
    test: () => call<{ ok: boolean; message: string }>('ai:test'),
    openrouterModels: () => call<OpenRouterModel[]>('ai:openrouterModels')
  },
  settings: {
    getAll: () => call<Record<string, string>>('settings:getAll'),
    set: (key: string, value: string) => call('settings:set', key, value)
  },
  theme: {
    set: (theme: 'system' | 'light' | 'dark') => call<boolean>('theme:set', theme),
    current: () => call<{ source: 'system' | 'light' | 'dark'; dark: boolean }>('theme:current')
  },
  export: {
    song: (songId: number, format: SingleExportFormat, lang: Lang) =>
      call<FileResult>('export:song', songId, format, lang),
    all: (format: ExportFormat, lang: Lang) => call<FileResult>('export:all', format, lang),
    setlist: (setlistId: number, format: ExportFormat, lang: Lang) =>
      call<FileResult>('export:setlist', setlistId, format, lang)
  },
  update: {
    check: () => call<{ state: string; message?: string }>('update:check'),
    install: () => call('update:install'),
    version: () => call<string>('update:version'),
    onStatus: (cb: (payload: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, payload: UpdateStatus): void => cb(payload)
      ipcRenderer.on('update:status', listener)
      return (): void => {
        ipcRenderer.removeListener('update:status', listener)
      }
    }
  },
  import: {
    files: () =>
      call<{ canceled: boolean; songs?: Song[]; failed?: { fileName: string; error: string }[] }>(
        'import:files'
      )
  },
  backup: {
    create: () =>
      call<{ canceled: boolean; filePath?: string; songs?: number; voiceFiles?: number }>(
        'backup:create'
      ),
    restore: () => call<{ canceled: boolean; songs?: number; voiceFiles?: number }>('backup:restore'),
    openFolder: () => call('backup:openFolder'),
    chooseDir: () => call<{ canceled: boolean; dir?: string }>('backup:chooseDir'),
    resetDir: () => call<string>('backup:resetDir')
  },
  clipboard: {
    write: (text: string) => call('clipboard:write', text)
  },
  shell: {
    showItem: (filePath: string) => call('shell:showItem', filePath)
  },
  report: {
    ai: (payload: { description: string; content: string; provider: string; model: string }) =>
      call<{ ok: boolean; truncated: boolean }>('report:ai', payload),
    issues: () => call('report:issues')
  },
  app: {
    /** Wywoływane przy zamykaniu okna: renderer zapisuje zmiany i potwierdza przez flushDone. */
    onFlushRequest: (cb: () => void): (() => void) => {
      const listener = (): void => cb()
      ipcRenderer.on('app:flushRequest', listener)
      return (): void => {
        ipcRenderer.removeListener('app:flushRequest', listener)
      }
    },
    flushDone: (): void => {
      ipcRenderer.send('app:flushDone')
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
