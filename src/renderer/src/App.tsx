import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat, Song } from '../../shared/types'
import Sidebar, { type SidebarView } from './components/Sidebar'
import Editor from './components/Editor'
import SettingsModal from './components/SettingsModal'
import SetlistsPanel from './components/SetlistsPanel'
import StageMode, { type StageItem } from './components/StageMode'
import Toast, { type ToastState } from './components/Toast'
import { errorMessage } from './lib/format'
import { flushAll } from './lib/flush'

export default function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [view, setView] = useState<SidebarView>('songs')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [stage, setStage] = useState<{ items: StageItem[]; index: number } | null>(null)
  const [setlistVersion, setSetlistVersion] = useState(0)
  const didAutoSelect = useRef(false)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((next: ToastState) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(next)
    toastTimer.current = window.setTimeout(() => setToast(null), next.duration ?? 3500)
  }, [])

  const closeToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(null)
  }, [])

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  // Motyw zapisany w bazie → atrybut na <html>
  useEffect(() => {
    window.api.theme.current().then(({ dark }) => applyThemeClass(dark))
  }, [])

  // Język interfejsu także w atrybucie <html lang> (czytniki ekranu, sprawdzanie pisowni)
  useEffect(() => {
    document.documentElement.lang = i18n.language === 'en' ? 'en' : 'pl'
  }, [i18n.language])

  // Zamykanie okna: zapisz niezapisane zmiany i dopiero wtedy potwierdź procesowi głównemu
  useEffect(() => {
    return window.api.app.onFlushRequest(() => {
      flushAll().finally(() => window.api.app.flushDone())
    })
  }, [])

  // Status aktualizacji — baner, gdy nowa wersja jest gotowa
  useEffect(() => {
    return window.api.update.onStatus((p) => {
      if (p.state === 'downloaded') {
        showToast({
          message: t('update.downloaded', { version: String(p.version ?? '') }),
          duration: 1_000_000,
          action: { label: t('update.restart'), onClick: () => void window.api.update.install() }
        })
      }
    })
  }, [showToast, t])

  const refresh = useCallback(async (q: string) => {
    const list = q.trim() ? await window.api.songs.search(q) : await window.api.songs.list()
    setSongs(list)
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => void refresh(query), query ? 120 : 0)
    return () => window.clearTimeout(handle)
  }, [query, refresh])

  // Po pierwszym załadowaniu zaznacz pierwszy utwór
  useEffect(() => {
    if (!didAutoSelect.current && selectedId === null && songs.length > 0) {
      didAutoSelect.current = true
      setSelectedId(songs[0].id)
    }
  }, [songs, selectedId])

  const selected = songs.find((s) => s.id === selectedId) ?? null

  /** Zapis z edytora: podmieniamy tylko ten utwór, bez pobierania całej listy po każdym znaku. */
  const applySong = useCallback((song: Song) => {
    setSongs((list) => list.map((s) => (s.id === song.id ? song : s)))
  }, [])

  const handleCreate = async (): Promise<void> => {
    await flushAll()
    const created = await window.api.songs.create({ title: '' })
    setQuery('')
    setView('songs')
    await refresh('')
    setSelectedId(created.id)
  }

  const handleImport = async (): Promise<void> => {
    try {
      await flushAll()
      const res = await window.api.import.files()
      if (res.canceled) return
      setQuery('')
      setView('songs')
      await refresh('')
      const imported = res.songs ?? []
      if (imported.length > 0) setSelectedId(imported[0].id)
      const failed = res.failed ?? []
      showToast({
        message:
          t('import.done', { count: imported.length }) +
          (failed.length ? ' ' + t('import.failed', { count: failed.length, names: failed.map((f) => f.fileName).join(', ') }) : ''),
        type: failed.length && imported.length === 0 ? 'error' : 'info',
        duration: failed.length ? 8000 : 4000
      })
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const handleExportAll = async (format: ExportFormat): Promise<void> => {
    try {
      await flushAll()
      const res = await window.api.export.all(format, i18n.language === 'en' ? 'en' : 'pl')
      if (res.canceled) {
        if (res.empty) showToast({ message: t('exportAll.empty'), type: 'error' })
        return
      }
      showToast({
        message: t('exportAll.done', { count: res.count, path: res.filePath }),
        action: { label: t('export.show'), onClick: () => void window.api.shell.showItem(res.filePath!) },
        duration: 6000
      })
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const handleDeleted = async (): Promise<void> => {
    setSelectedId(null)
    setSetlistVersion((v) => v + 1)
    await refresh(query)
  }

  const handleSelect = (id: number): void => {
    if (id !== selectedId) void flushAll()
    setSelectedId(id)
  }

  const openStageForSong = (song: Song): void => {
    setStage({
      items: [{ title: song.title, artist: song.artist, key: song.key, text: song.chords.trim() ? song.chords : song.lyrics }],
      index: 0
    })
  }

  return (
    <div className="app">
      <Sidebar
        songs={songs}
        selectedId={selectedId}
        query={query}
        view={view}
        onView={(v) => {
          void flushAll()
          setView(v)
        }}
        onQuery={setQuery}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onImport={handleImport}
        onExportAll={handleExportAll}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {view === 'songs' ? (
        <Editor
          key={selected?.id ?? 'none'}
          song={selected}
          onSaved={applySong}
          onListChanged={() => refresh(query)}
          onDeleted={handleDeleted}
          onStage={openStageForSong}
          showToast={showToast}
        />
      ) : (
        <SetlistsPanel
          version={setlistVersion}
          onOpenSong={(id) => {
            setView('songs')
            setSelectedId(id)
          }}
          onStage={(items, index) => setStage({ items, index })}
          showToast={showToast}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onLanguage={(lng) => {
            void i18n.changeLanguage(lng)
            try {
              localStorage.setItem('language', lng)
            } catch {
              /* pamięć przeglądarki niedostępna — język zostanie tylko na tę sesję */
            }
          }}
          onThemeChanged={applyThemeClass}
          onRestored={async () => {
            setSelectedId(null)
            didAutoSelect.current = false
            setSetlistVersion((v) => v + 1)
            await refresh(query)
          }}
          showToast={showToast}
        />
      )}
      {stage && <StageMode items={stage.items} index={stage.index} onClose={() => setStage(null)} />}
      {toast && <Toast toast={toast} onClose={closeToast} />}
    </div>
  )
}

function applyThemeClass(dark: boolean): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
