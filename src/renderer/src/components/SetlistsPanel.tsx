import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat, Setlist, SetlistDetail, Song } from '../../../shared/types'
import { transposeKey, transposeText } from '../../../shared/chords'
import type { StageItem } from './StageMode'
import type { ToastState } from './Toast'
import { errorMessage } from '../lib/format'

interface Props {
  /** Zmienia się, gdy utwory zostały usunięte/przywrócone — wymusza ponowne wczytanie. */
  version: number
  onOpenSong: (id: number) => void
  onStage: (items: StageItem[], index: number) => void
  showToast: (t: ToastState) => void
}

export default function SetlistsPanel({ version, onOpenSong, onStage, showToast }: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'pl'
  const [lists, setLists] = useState<Setlist[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<SetlistDetail | null>(null)
  const [allSongs, setAllSongs] = useState<Song[]>([])
  const [newName, setNewName] = useState('')
  const [addId, setAddId] = useState('')
  const [name, setName] = useState('')

  const fail = useCallback((e: unknown) => showToast({ message: errorMessage(e), type: 'error' }), [showToast])

  const loadLists = useCallback(async (): Promise<void> => {
    try {
      setLists(await window.api.setlists.list())
    } catch (e) {
      fail(e)
    }
  }, [fail])

  const loadDetail = useCallback(
    async (id: number | null): Promise<void> => {
      if (id === null) {
        setDetail(null)
        return
      }
      try {
        const d = (await window.api.setlists.get(id)) ?? null
        setDetail(d)
        setName(d?.setlist.name ?? '')
        if (!d) setSelectedId(null)
      } catch (e) {
        fail(e)
      }
    },
    [fail]
  )

  useEffect(() => {
    void loadLists()
    void window.api.songs.list().then(setAllSongs).catch(fail)
  }, [version, loadLists, fail])

  useEffect(() => {
    void loadDetail(selectedId)
  }, [selectedId, version, loadDetail])

  const create = async (): Promise<void> => {
    const n = newName.trim()
    if (!n) return
    try {
      const created = await window.api.setlists.create(n)
      setNewName('')
      await loadLists()
      setSelectedId(created.id)
    } catch (e) {
      fail(e)
    }
  }

  const refreshAll = async (): Promise<void> => {
    await loadLists()
    await loadDetail(selectedId)
  }

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn()
      await refreshAll()
    } catch (e) {
      fail(e)
    }
  }

  const remove = async (): Promise<void> => {
    if (!detail || !confirm(t('setlists.deleteConfirm', { name: detail.setlist.name }))) return
    try {
      await window.api.setlists.delete(detail.setlist.id)
      setSelectedId(null)
      await loadLists()
    } catch (e) {
      fail(e)
    }
  }

  const rename = async (): Promise<void> => {
    if (!detail) return
    const n = name.trim()
    if (!n || n === detail.setlist.name) {
      setName(detail.setlist.name)
      return
    }
    await run(() => window.api.setlists.rename(detail.setlist.id, n))
  }

  const stageItems = (): StageItem[] =>
    (detail?.items ?? []).map((i) => {
      const target = i.key ? transposeKey(i.key, i.transpose) : ''
      const text = i.chords.trim()
        ? transposeText(i.chords, i.transpose, { targetKey: target || null })
        : i.lyrics
      return { title: i.title, artist: i.artist, key: i.transpose ? target : i.key, text }
    })

  const exportList = async (format: ExportFormat): Promise<void> => {
    if (!detail) return
    try {
      const res = await window.api.export.setlist(detail.setlist.id, format, lang)
      if (res.canceled) {
        if (res.empty) showToast({ message: t('setlists.emptyExport'), type: 'error' })
        return
      }
      showToast({
        message: t('exportAll.done', { count: res.count, path: res.filePath }),
        action: { label: t('export.show'), onClick: () => void window.api.shell.showItem(res.filePath!) },
        duration: 6000
      })
    } catch (e) {
      fail(e)
    }
  }

  const inList = new Set(detail?.items.map((i) => i.song_id))
  const candidates = allSongs.filter((s) => !inList.has(s.id))

  return (
    <main className="editor setlists">
      <div className="setlists-layout">
        <div className="setlists-list">
          <div className="voice-controls">
            <input
              style={{ flex: 1, minWidth: 0 }}
              aria-label={t('setlists.newName')}
              placeholder={t('setlists.newName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
            <button className="btn btn-primary" onClick={() => void create()} aria-label={t('setlists.create')}>
              ＋
            </button>
          </div>
          {lists.length === 0 && <div className="empty-hint">{t('setlists.empty')}</div>}
          {lists.map((l) => (
            <button
              key={l.id}
              className={`song-item ${l.id === selectedId ? 'active' : ''}`}
              aria-current={l.id === selectedId ? 'true' : undefined}
              onClick={() => setSelectedId(l.id)}
            >
              <div className="song-item-title">{l.name}</div>
              <div className="song-item-sub">{t('setlists.count', { count: l.item_count })}</div>
            </button>
          ))}
        </div>

        <div className="setlist-detail">
          {!detail ? (
            <div className="editor-empty">
              <div>
                <div style={{ fontSize: 42, marginBottom: 12 }} aria-hidden="true">
                  📋
                </div>
                {t('setlists.select')}
              </div>
            </div>
          ) : (
            <>
              <div className="toolbar">
                <input
                  className="setlist-name"
                  aria-label={t('setlists.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => void rename()}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
                <div className="spacer" />
                <button
                  className="btn btn-primary"
                  disabled={detail.items.length === 0}
                  onClick={() => onStage(stageItems(), 0)}
                >
                  🎤 {t('stage.open')}
                </button>
                <button className="btn" onClick={() => void exportList('pdf')}>
                  📄 PDF
                </button>
                <button className="btn" onClick={() => void exportList('docx')}>
                  📝 DOCX
                </button>
                <button className="btn" onClick={() => void exportList('md')}>
                  ⬇ MD
                </button>
                <button className="btn btn-danger" onClick={() => void remove()} aria-label={t('setlists.delete')}>
                  🗑
                </button>
              </div>

              <div className="editor-body">
                <div className="voice-controls">
                  <select
                    style={{ flex: 1 }}
                    aria-label={t('setlists.addSong')}
                    value={addId}
                    onChange={(e) => setAddId(e.target.value)}
                  >
                    <option value="">{t('setlists.addSong')}…</option>
                    {candidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title || t('editor.titlePlaceholder')}
                        {s.artist ? ` — ${s.artist}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    disabled={!addId}
                    onClick={() => {
                      const songId = Number(addId)
                      setAddId('')
                      void run(() => window.api.setlists.add(detail.setlist.id, songId))
                    }}
                  >
                    ＋ {t('setlists.add')}
                  </button>
                </div>

                {detail.items.length === 0 && <div className="empty-hint">{t('setlists.noItems')}</div>}

                {detail.items.map((item, idx) => {
                  const keyShown = item.key ? transposeKey(item.key, item.transpose) : ''
                  return (
                    <div className="setlist-item" key={item.id}>
                      <span className="setlist-pos">{idx + 1}</span>
                      <button className="setlist-title" onClick={() => onOpenSong(item.song_id)}>
                        <strong>{item.title || t('editor.titlePlaceholder')}</strong>
                        <span className="hint">{item.artist}</span>
                      </button>
                      <span className="badge" title={t('setlists.keyHint')}>
                        {keyShown || '—'}
                      </span>
                      <button
                        className="btn"
                        aria-label={t('editor.semitoneDown')}
                        disabled={item.transpose <= -11}
                        onClick={() => void run(() => window.api.setlists.setTranspose(item.id, item.transpose - 1))}
                      >
                        ♭
                      </button>
                      <span className="hint transpose-value">
                        {item.transpose > 0 ? `+${item.transpose}` : item.transpose}
                      </span>
                      <button
                        className="btn"
                        aria-label={t('editor.semitoneUp')}
                        disabled={item.transpose >= 11}
                        onClick={() => void run(() => window.api.setlists.setTranspose(item.id, item.transpose + 1))}
                      >
                        ♯
                      </button>
                      <button
                        className="btn"
                        aria-label={t('setlists.moveUp')}
                        disabled={idx === 0}
                        onClick={() => void run(() => window.api.setlists.move(item.id, -1))}
                      >
                        ▲
                      </button>
                      <button
                        className="btn"
                        aria-label={t('setlists.moveDown')}
                        disabled={idx === detail.items.length - 1}
                        onClick={() => void run(() => window.api.setlists.move(item.id, 1))}
                      >
                        ▼
                      </button>
                      <button
                        className="btn btn-danger"
                        aria-label={t('setlists.remove')}
                        onClick={() => void run(() => window.api.setlists.remove(item.id))}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
                <div className="hint" style={{ marginTop: 10 }}>
                  {t('setlists.transposeNote')}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
