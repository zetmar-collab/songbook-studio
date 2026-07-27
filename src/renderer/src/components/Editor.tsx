import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../../preload/index.d'
import type { ToastState } from './Toast'
import VoiceNotes from './VoiceNotes'
import Versions from './Versions'
import { transposeBracketed, transposeKey } from '../lib/transpose'

type Tab = 'lyrics' | 'chords' | 'notes' | 'voice' | 'versions'

interface Props {
  song: Song | null
  onChanged: () => void
  onDeleted: () => void
  showToast: (t: ToastState) => void
}

export default function Editor({ song, onChanged, onDeleted, showToast }: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState<Song | null>(song)
  const [dirty, setDirty] = useState(false)
  const [tab, setTab] = useState<Tab>('lyrics')
  const [generating, setGenerating] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const saveTimer = useRef<number | null>(null)

  useEffect(() => {
    setDraft(song)
    setDirty(false)
    setTab('lyrics')
  }, [song])

  if (!draft) {
    return (
      <main className="editor">
        <div className="editor-empty">
          <div>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🎼</div>
            {t('editor.selectSong')}
          </div>
        </div>
      </main>
    )
  }

  const update = (patch: Partial<Song>): void => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setDirty(true)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => save({ ...draft, ...patch }), 900)
  }

  const save = async (data: Song): Promise<void> => {
    await window.api.songs.update(data.id, data)
    setDirty(false)
    onChanged()
  }

  const saveNow = async (): Promise<void> => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (draft) await save(draft)
  }

  const toggleFavorite = async (): Promise<void> => {
    const next = { ...draft, is_favorite: draft.is_favorite ? 0 : 1 }
    setDraft(next)
    await window.api.songs.update(draft.id, { is_favorite: next.is_favorite })
    onChanged()
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirm(t('editor.deleteConfirm'))) return
    await window.api.songs.delete(draft.id)
    onDeleted()
  }

  const generateChords = async (): Promise<void> => {
    if (!draft.lyrics.trim()) {
      showToast({ message: t('ai.needLyrics'), type: 'error' })
      return
    }
    setGenerating(true)
    try {
      const chords: string = await window.api.ai.generateChords({
        title: draft.title,
        artist: draft.artist,
        key: draft.key,
        lyrics: draft.lyrics,
        language: i18n.language === 'pl' ? 'pl' : 'en'
      })
      const next = { ...draft, chords }
      setDraft(next)
      await save(next)
      setTab('chords')
      showToast({ message: t('ai.done') })
    } catch (e) {
      showToast({
        message: t('ai.error', { message: e instanceof Error ? e.message : String(e) }),
        type: 'error',
        duration: 6000
      })
    } finally {
      setGenerating(false)
    }
  }

  const transpose = async (semitones: number): Promise<void> => {
    const next = {
      ...draft,
      chords: transposeBracketed(draft.chords, semitones),
      key: transposeKey(draft.key, semitones)
    }
    setDraft(next)
    await save(next)
  }

  const doExport = async (format: 'pdf' | 'docx' | 'md'): Promise<void> => {
    setExportOpen(false)
    await saveNow()
    try {
      const res = await window.api.export.song(draft.id, format)
      if (res.canceled) return
      showToast({
        message: t('export.done', { path: res.filePath }),
        action: {
          label: t('export.show'),
          onClick: () => window.api.shell.showItem(res.filePath!)
        },
        duration: 6000
      })
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    }
  }

  return (
    <main className="editor">
      <div className="editor-head">
        <input
          className="title-input"
          placeholder={t('editor.titlePlaceholder')}
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="meta-row">
          <input
            placeholder={t('editor.artist')}
            value={draft.artist}
            onChange={(e) => update({ artist: e.target.value })}
          />
          <input
            className="key-input"
            placeholder={t('editor.key')}
            value={draft.key}
            onChange={(e) => update({ key: e.target.value })}
          />
          <input
            placeholder={t('editor.tags')}
            value={draft.tags}
            onChange={(e) => update({ tags: e.target.value })}
          />
        </div>
      </div>

      <div className="toolbar">
        <span className={`status ${dirty ? 'unsaved' : 'saved'}`}>
          {dirty ? '● ' + t('editor.unsaved') : '✓ ' + t('editor.saved')}
        </span>
        <div className="spacer" />

        <button className="btn" onClick={toggleFavorite}>
          {draft.is_favorite ? '★' : '☆'}
        </button>

        <button className="btn btn-primary" onClick={generateChords} disabled={generating}>
          {generating ? '✨ ' + t('ai.generating') : '✨ ' + t('ai.generate')}
        </button>

        <div className="dropdown">
          <button className="btn" onClick={() => setExportOpen((v) => !v)}>
            ⬇ {t('editor.export')} ▾
          </button>
          {exportOpen && (
            <div className="dropdown-menu">
              <button onClick={() => doExport('pdf')}>📄 {t('export.pdf')}</button>
              <button onClick={() => doExport('docx')}>📝 {t('export.docx')}</button>
              <button onClick={() => doExport('md')}>⬇ {t('export.md')}</button>
            </div>
          )}
        </div>

        <button className="btn btn-danger" onClick={handleDelete} title={t('editor.delete')}>
          🗑
        </button>
      </div>

      <div className="tabs">
        {(['lyrics', 'chords', 'notes', 'voice', 'versions'] as Tab[]).map((tb) => (
          <button
            key={tb}
            className={`tab ${tab === tb ? 'active' : ''}`}
            onClick={() => setTab(tb)}
          >
            {t(`editor.tab${tb.charAt(0).toUpperCase() + tb.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="editor-body">
        {tab === 'lyrics' && (
          <textarea
            className="text-area"
            placeholder={t('editor.lyricsPlaceholder')}
            value={draft.lyrics}
            onChange={(e) => update({ lyrics: e.target.value })}
          />
        )}
        {tab === 'chords' && (
          <>
            <div className="transpose-bar">
              <span className="hint">{t('editor.transpose')}:</span>
              <button className="btn" onClick={() => transpose(-1)}>
                ♭ −1
              </button>
              <button className="btn" onClick={() => transpose(1)}>
                ♯ +1
              </button>
              {draft.key && <span className="badge">{draft.key}</span>}
            </div>
            <textarea
              className="text-area"
              placeholder={t('editor.chordsPlaceholder')}
              value={draft.chords}
              onChange={(e) => update({ chords: e.target.value })}
            />
          </>
        )}
        {tab === 'notes' && (
          <textarea
            className="text-area"
            placeholder={t('editor.notesPlaceholder')}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        )}
        {tab === 'voice' && <VoiceNotes songId={draft.id} showToast={showToast} />}
        {tab === 'versions' && (
          <Versions
            songId={draft.id}
            onRestored={async () => {
              const fresh = await window.api.songs.get(draft.id)
              if (fresh) {
                setDraft(fresh)
                onChanged()
              }
            }}
            showToast={showToast}
          />
        )}
      </div>
    </main>
  )
}
