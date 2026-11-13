import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song, SongPatch, SingleExportFormat } from '../../../shared/types'
import { ALL_KEYS, parseKey, semitonesBetween, suggestCapo, transposeKey, transposeText } from '../../../shared/chords'
import type { ToastState } from './Toast'
import VoiceNotes from './VoiceNotes'
import Versions from './Versions'
import SunoPanel from './SunoPanel'
import ChordSheet from './ChordSheet'
import ReportAiModal from './ReportAiModal'
import { errorMessage } from '../lib/format'
import { registerFlush } from '../lib/flush'

type Tab = 'lyrics' | 'chords' | 'preview' | 'notes' | 'suno' | 'voice' | 'versions'
const TABS: Tab[] = ['lyrics', 'chords', 'preview', 'notes', 'suno', 'voice', 'versions']
type SaveState = 'saved' | 'dirty' | 'error'

const SAVE_DELAY_MS = 900

interface Props {
  song: Song | null
  onSaved: (song: Song) => void
  onListChanged: () => void
  onDeleted: () => void
  onStage: (song: Song) => void
  showToast: (t: ToastState) => void
}

function patchOf(d: Song): SongPatch {
  return {
    title: d.title,
    artist: d.artist,
    key: d.key,
    tags: d.tags,
    lyrics: d.lyrics,
    chords: d.chords,
    notes: d.notes,
    suno_style: d.suno_style
  }
}

export default function Editor(props: Props): JSX.Element {
  const { song } = props
  const { t } = useTranslation()
  if (!song) {
    return (
      <main className="editor">
        <div className="editor-empty">
          <div>
            <div style={{ fontSize: 42, marginBottom: 12 }} aria-hidden="true">
              🎼
            </div>
            {t('editor.selectSong')}
          </div>
        </div>
      </main>
    )
  }
  return <SongEditor {...props} song={song} />
}

function SongEditor({
  song,
  onSaved,
  onListChanged,
  onDeleted,
  onStage,
  showToast
}: Props & { song: Song }): JSX.Element {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'pl'

  // Szkic trzymamy w stanie (do renderowania) i w ref (do zapisów, które nie mogą widzieć starych domknięć).
  // Komponent jest montowany od nowa dla każdego utworu (key w App), więc zapis z listy nie resetuje zakładki.
  const [draft, setDraftState] = useState<Song>(song)
  const draftRef = useRef<Song>(song)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [tab, setTab] = useState<Tab>('lyrics')
  const [generating, setGenerating] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [aiInfo, setAiInfo] = useState({ provider: '', model: '' })

  const cbRef = useRef({ onSaved, showToast, t })
  cbRef.current = { onSaved, showToast, t }

  const setDraft = useCallback((next: Song) => {
    draftRef.current = next
    setDraftState(next)
  }, [])

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return true
    const d = draftRef.current
    dirtyRef.current = false
    try {
      const saved = await window.api.songs.update(d.id, patchOf(d))
      cbRef.current.onSaved(saved)
      if (mountedRef.current && !dirtyRef.current) setSaveState('saved')
      return true
    } catch (e) {
      dirtyRef.current = true
      if (mountedRef.current) setSaveState('error')
      cbRef.current.showToast({
        message: cbRef.current.t('editor.saveError', { message: errorMessage(e) }),
        type: 'error',
        duration: 6000
      })
      return false
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const unregister = registerFlush(flush)
    return () => {
      unregister()
      mountedRef.current = false
      void flush() // przełączenie na inny utwór nie może gubić ostatnich znaków
    }
  }, [flush])

  const update = useCallback(
    (patch: Partial<Song>): void => {
      setDraft({ ...draftRef.current, ...patch })
      dirtyRef.current = true
      setSaveState('dirty')
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush, setDraft]
  )

  /** Podmienia szkic na stan z bazy (po przywróceniu wersji, cofnięciu itp.). */
  const adopt = useCallback(
    (fresh: Song): void => {
      dirtyRef.current = false
      if (timerRef.current) window.clearTimeout(timerRef.current)
      setDraft(fresh)
      setSaveState('saved')
      cbRef.current.onSaved(fresh)
    },
    [setDraft]
  )

  /**
   * Operacja destrukcyjna z siatką bezpieczeństwa: przed zmianą zapisuje automatyczną wersję,
   * a po zmianie pokazuje komunikat z przyciskiem „Cofnij".
   */
  const withSnapshot = useCallback(
    async (label: string, doneMessage: string, mutate: () => Promise<void> | void): Promise<void> => {
      if (!(await flush())) return
      const snap = await window.api.versions.create(draftRef.current.id, label, 'auto')
      await mutate()
      await flush()
      cbRef.current.showToast({
        message: doneMessage,
        duration: 8000,
        action: {
          label: cbRef.current.t('editor.undo'),
          onClick: () => {
            void window.api.versions
              .restore(snap.id)
              .then(adopt)
              .catch((e) => cbRef.current.showToast({ message: errorMessage(e), type: 'error' }))
          }
        }
      })
    },
    [adopt, flush]
  )

  const toggleFavorite = async (): Promise<void> => {
    const next = draft.is_favorite ? 0 : 1
    setDraft({ ...draftRef.current, is_favorite: next })
    try {
      const saved = await window.api.songs.update(draft.id, { is_favorite: next })
      onSaved(saved)
      onListChanged()
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!confirm(t('editor.deleteConfirm'))) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    dirtyRef.current = false // utwór znika — nie zapisujemy już zmian
    try {
      await window.api.songs.delete(draft.id)
      onDeleted()
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const generateChords = async (): Promise<void> => {
    if (!draft.lyrics.trim()) {
      showToast({ message: t('ai.needLyrics'), type: 'error' })
      return
    }
    setGenerating(true)
    try {
      const d = draftRef.current
      const chords = await window.api.ai.generateChords({
        title: d.title,
        artist: d.artist,
        key: d.key,
        lyrics: d.lyrics,
        language: lang
      })
      await withSnapshot(t('snapshot.beforeAi'), t('ai.doneUndo'), () => update({ chords }))
      setTab('chords')
    } catch (e) {
      showToast({ message: t('ai.error', { message: errorMessage(e) }), type: 'error', duration: 6000 })
    } finally {
      if (mountedRef.current) setGenerating(false)
    }
  }

  const transposeBy = async (semitones: number, targetKey?: string): Promise<void> => {
    if (semitones === 0) return
    const d = draftRef.current
    const newKey = targetKey ?? transposeKey(d.key, semitones)
    await withSnapshot(t('snapshot.beforeTranspose'), t('editor.transposed'), () =>
      update({
        chords: transposeText(d.chords, semitones, { targetKey: newKey || null }),
        key: newKey
      })
    )
  }

  const restoreVersion = async (versionId: number): Promise<void> => {
    if (!(await flush())) return
    try {
      const snap = await window.api.versions.create(draftRef.current.id, t('snapshot.beforeRestore'), 'auto')
      const restored = await window.api.versions.restore(versionId)
      adopt(restored)
      onListChanged()
      showToast({
        message: t('versions.restored'),
        duration: 8000,
        action: {
          label: t('editor.undo'),
          onClick: () => {
            void window.api.versions
              .restore(snap.id)
              .then(adopt)
              .catch((e) => showToast({ message: errorMessage(e), type: 'error' }))
          }
        }
      })
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const openReport = async (): Promise<void> => {
    try {
      const s = await window.api.settings.getAll()
      const provider = s.ai_provider || 'openrouter'
      setAiInfo({ provider, model: (provider === 'gemini' ? s.gemini_model : s.openrouter_model) || '' })
    } catch {
      setAiInfo({ provider: '', model: '' })
    }
    setReportOpen(true)
  }

  const doExport = async (format: SingleExportFormat): Promise<void> => {
    setExportOpen(false)
    if (!(await flush())) return
    try {
      const res = await window.api.export.song(draft.id, format, lang)
      if (res.canceled) return
      showToast({
        message: t('export.done', { path: res.filePath }),
        action: { label: t('export.show'), onClick: () => void window.api.shell.showItem(res.filePath!) },
        duration: 6000
      })
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const keyIsKnown = parseKey(draft.key) !== null
  const capo = useMemo(() => (tab === 'chords' ? suggestCapo(draft.chords) : null), [tab, draft.chords])

  const status =
    saveState === 'dirty' ? '● ' + t('editor.unsaved') : saveState === 'error' ? '⚠ ' + t('editor.notSaved') : '✓ ' + t('editor.saved')

  return (
    <main className="editor">
      <div className="editor-head">
        <input
          className="title-input"
          aria-label={t('editor.titlePlaceholder')}
          placeholder={t('editor.titlePlaceholder')}
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="meta-row">
          <input
            aria-label={t('editor.artist')}
            placeholder={t('editor.artist')}
            value={draft.artist}
            onChange={(e) => update({ artist: e.target.value })}
          />
          <input
            className="key-input"
            aria-label={t('editor.key')}
            placeholder={t('editor.key')}
            spellCheck={false}
            value={draft.key}
            onChange={(e) => update({ key: e.target.value })}
          />
          <input
            aria-label={t('editor.tags')}
            placeholder={t('editor.tags')}
            value={draft.tags}
            onChange={(e) => update({ tags: e.target.value })}
          />
        </div>
      </div>

      <div className="toolbar">
        <span className={`status ${saveState === 'saved' ? 'saved' : 'unsaved'}`} role="status">
          {status}
        </span>
        <div className="spacer" />

        <button
          className="btn"
          onClick={toggleFavorite}
          aria-label={draft.is_favorite ? t('editor.unfavorite') : t('editor.favorite')}
          title={draft.is_favorite ? t('editor.unfavorite') : t('editor.favorite')}
        >
          {draft.is_favorite ? '★' : '☆'}
        </button>

        <button
          className="btn"
          onClick={async () => {
            if (await flush()) onStage(draftRef.current)
          }}
          title={t('stage.open')}
        >
          🎤 {t('stage.open')}
        </button>

        <button className="btn btn-primary" onClick={generateChords} disabled={generating}>
          {generating ? '✨ ' + t('ai.generating') : '✨ ' + t('ai.generate')}
        </button>

        <div className="dropdown">
          <button
            className="btn"
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onClick={() => setExportOpen((v) => !v)}
          >
            ⬇ {t('editor.export')} ▾
          </button>
          {exportOpen && (
            <div className="dropdown-menu" role="menu">
              <button onClick={() => doExport('pdf')}>📄 {t('export.pdf')}</button>
              <button onClick={() => doExport('docx')}>📝 {t('export.docx')}</button>
              <button onClick={() => doExport('md')}>⬇ {t('export.md')}</button>
              <button onClick={() => doExport('cho')}>🎸 {t('export.cho')}</button>
            </div>
          )}
        </div>

        <button
          className="btn btn-danger"
          onClick={handleDelete}
          aria-label={t('editor.delete')}
          title={t('editor.delete')}
        >
          🗑
        </button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tb) => (
          <button
            key={tb}
            role="tab"
            aria-selected={tab === tb}
            className={`tab ${tab === tb ? 'active' : ''}`}
            onClick={() => setTab(tb)}
          >
            {t(`editor.tab.${tb}`)}
          </button>
        ))}
      </div>

      <div className="editor-body">
        {tab === 'lyrics' && (
          <textarea
            className="text-area"
            aria-label={t('editor.tab.lyrics')}
            placeholder={t('editor.lyricsPlaceholder')}
            value={draft.lyrics}
            onChange={(e) => update({ lyrics: e.target.value })}
          />
        )}
        {tab === 'chords' && (
          <>
            <div className="transpose-bar">
              <span className="hint">{t('editor.transpose')}:</span>
              <button className="btn" onClick={() => void transposeBy(-1)} aria-label={t('editor.semitoneDown')}>
                ♭ −1
              </button>
              <button className="btn" onClick={() => void transposeBy(1)} aria-label={t('editor.semitoneUp')}>
                ♯ +1
              </button>
              {keyIsKnown && (
                <label className="inline-field">
                  <span className="hint">{t('editor.targetKey')}:</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const target = e.target.value
                      const n = semitonesBetween(draft.key, target)
                      if (target && n !== null) void transposeBy(n > 6 ? n - 12 : n, target)
                    }}
                  >
                    <option value="">{draft.key || '—'}</option>
                    {ALL_KEYS.filter((k) => k !== draft.key).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {draft.key && <span className="badge">{draft.key}</span>}
              {capo && (
                <span className="capo-hint" title={capo.shapes.join(' ')}>
                  🎸 {t('editor.capo', { capo: capo.capo })} · {capo.shapes.slice(0, 6).join(' ')}
                </span>
              )}
              <div className="spacer" />
              {/* Wymagane przez politykę Sklepu 11.16 — zgłaszanie treści z AI */}
              <button className="btn btn-report" onClick={openReport}>
                ⚠️ {t('report.button')}
              </button>
            </div>
            <textarea
              className="text-area mono"
              aria-label={t('editor.tab.chords')}
              spellCheck={false}
              placeholder={t('editor.chordsPlaceholder')}
              value={draft.chords}
              onChange={(e) => update({ chords: e.target.value })}
            />
          </>
        )}
        {tab === 'preview' && (
          <div className="preview-pane">
            {draft.chords.trim() || draft.lyrics.trim() ? (
              <ChordSheet text={draft.chords.trim() ? draft.chords : draft.lyrics} />
            ) : (
              <div className="empty-hint">{t('editor.previewEmpty')}</div>
            )}
          </div>
        )}
        {tab === 'notes' && (
          <textarea
            className="text-area"
            aria-label={t('editor.tab.notes')}
            placeholder={t('editor.notesPlaceholder')}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        )}
        {tab === 'suno' && <SunoPanel draft={draft} update={update} showToast={showToast} />}
        {tab === 'voice' && <VoiceNotes songId={draft.id} showToast={showToast} />}
        {tab === 'versions' && (
          <Versions
            songId={draft.id}
            current={draft}
            flush={flush}
            onRestore={restoreVersion}
            showToast={showToast}
          />
        )}
      </div>

      {reportOpen && (
        <ReportAiModal
          content={draft.chords}
          provider={aiInfo.provider}
          model={aiInfo.model}
          onClose={() => setReportOpen(false)}
          showToast={showToast}
        />
      )}
    </main>
  )
}
