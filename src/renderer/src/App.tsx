import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../preload/index.d'
import Sidebar from './components/Sidebar'
import Editor from './components/Editor'
import SettingsModal from './components/SettingsModal'
import Toast, { ToastState } from './components/Toast'

export default function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const didAutoSelect = useRef(false)

  const showToast = useCallback((t: ToastState) => {
    setToast(t)
    window.setTimeout(() => setToast(null), t.duration ?? 3500)
  }, [])

  // Załaduj motyw zapisany w bazie i zastosuj klasę na <html>
  useEffect(() => {
    window.api.theme.current().then(({ dark }) => applyThemeClass(dark))
  }, [])

  // Nasłuchuj statusu aktualizacji — pokaż baner, gdy nowa wersja jest gotowa
  useEffect(() => {
    const unsub = window.api.update.onStatus((p) => {
      if (p.state === 'downloaded') {
        setToast({
          message: `⬆ Nowa wersja ${p.version} gotowa do instalacji`,
          duration: 1_000_000,
          action: { label: 'Uruchom ponownie', onClick: () => window.api.update.install() }
        })
      }
    })
    return unsub
  }, [])

  const refresh = useCallback(async (q: string) => {
    const list = q.trim() ? await window.api.songs.search(q) : await window.api.songs.list()
    setSongs(list)
  }, [])

  useEffect(() => {
    refresh(query)
  }, [query, refresh])

  // Po pierwszym załadowaniu automatycznie zaznacz pierwszy utwór
  useEffect(() => {
    if (!didAutoSelect.current && selectedId === null && songs.length > 0) {
      didAutoSelect.current = true
      setSelectedId(songs[0].id)
    }
  }, [songs, selectedId])

  const selected = songs.find((s) => s.id === selectedId) ?? null

  const handleCreate = async (): Promise<void> => {
    const created = await window.api.songs.create({ title: '' })
    setQuery('')
    await refresh('')
    setSelectedId(created.id)
  }

  const handleImport = async (): Promise<void> => {
    try {
      const res = await window.api.import.docx()
      if (res.canceled) return
      setQuery('')
      await refresh('')
      setSelectedId(res.song.id)
      showToast({ message: '✓ ' + res.song.title })
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    }
  }

  const handleExportAll = async (format: 'pdf' | 'docx' | 'md'): Promise<void> => {
    try {
      const res = await window.api.export.all(format)
      if (res.canceled) {
        if (res.empty) showToast({ message: t('exportAll.empty'), type: 'error' })
        return
      }
      showToast({
        message: t('exportAll.done', { count: res.count, path: res.filePath }),
        action: { label: t('export.show'), onClick: () => window.api.shell.showItem(res.filePath!) },
        duration: 6000
      })
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    }
  }

  const handleChanged = async (): Promise<void> => {
    await refresh(query)
  }

  const handleDeleted = async (): Promise<void> => {
    setSelectedId(null)
    await refresh(query)
  }

  return (
    <div className="app">
      <Sidebar
        songs={songs}
        selectedId={selectedId}
        query={query}
        onQuery={setQuery}
        onSelect={setSelectedId}
        onCreate={handleCreate}
        onImport={handleImport}
        onExportAll={handleExportAll}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <Editor
        key={selected?.id ?? 'none'}
        song={selected}
        onChanged={handleChanged}
        onDeleted={handleDeleted}
        showToast={showToast}
      />
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onLanguage={(lng) => {
            i18n.changeLanguage(lng)
            localStorage.setItem('language', lng)
          }}
          onThemeChanged={applyThemeClass}
          showToast={showToast}
        />
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function applyThemeClass(dark: boolean): void {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
