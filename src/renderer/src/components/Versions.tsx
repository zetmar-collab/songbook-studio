import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song, Version } from '../../../shared/types'
import { diffLines, diffStats } from '../../../shared/diff'
import type { ToastState } from './Toast'
import { errorMessage, formatDbDate } from '../lib/format'

interface Props {
  songId: number
  /** Bieżący (jeszcze niezapisany) szkic — do porównań i znacznika „zgodna z bieżącą". */
  current: Song
  flush: () => Promise<boolean>
  onRestore: (versionId: number) => Promise<void>
  showToast: (t: ToastState) => void
}

export default function Versions({ songId, current, flush, onRestore, showToast }: Props): JSX.Element {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<Version[]>([])
  const [label, setLabel] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [showAuto, setShowAuto] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    try {
      setVersions(await window.api.versions.list(songId))
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }, [songId, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const create = async (): Promise<void> => {
    if (!(await flush())) return
    try {
      await window.api.versions.create(songId, label.trim() || new Date().toLocaleString(), 'manual')
      setLabel('')
      await load()
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const restore = async (id: number): Promise<void> => {
    if (!confirm(t('versions.restoreConfirm'))) return
    await onRestore(id)
    await load()
  }

  const remove = async (id: number): Promise<void> => {
    try {
      await window.api.versions.delete(id)
      if (openId === id) setOpenId(null)
      await load()
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const visible = versions.filter((v) => showAuto || v.kind === 'manual')
  const hasAuto = versions.some((v) => v.kind === 'auto')

  return (
    <div>
      <div className="voice-controls">
        <input
          style={{ flex: 1 }}
          aria-label={t('versions.labelPlaceholder')}
          placeholder={t('versions.labelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void create()}
        />
        <button className="btn btn-primary" onClick={() => void create()}>
          💾 {t('versions.create')}
        </button>
      </div>

      {hasAuto && (
        <label className="check">
          <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />
          {t('versions.showAuto')}
        </label>
      )}

      {visible.length === 0 && <div className="empty-hint">{t('versions.empty')}</div>}

      {visible.map((v) => (
        <VersionRow
          key={v.id}
          version={v}
          current={current}
          open={openId === v.id}
          onToggle={() => setOpenId(openId === v.id ? null : v.id)}
          onRestore={() => void restore(v.id)}
          onDelete={() => void remove(v.id)}
        />
      ))}
    </div>
  )
}

function VersionRow({
  version: v,
  current,
  open,
  onToggle,
  onRestore,
  onDelete
}: {
  version: Version
  current: Song
  open: boolean
  onToggle: () => void
  onRestore: () => void
  onDelete: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const sameAsCurrent = v.lyrics === current.lyrics && v.chords === current.chords
  // Różnice liczymy osobno dla tekstu i akordów. Kierunek: bieżący stan → wersja, czyli to, co zmieni przywrócenie
  const lyricsOps = useMemo(() => (open ? diffLines(current.lyrics, v.lyrics) : []), [open, current.lyrics, v.lyrics])
  const chordsOps = useMemo(() => (open ? diffLines(current.chords, v.chords) : []), [open, current.chords, v.chords])
  const stats = useMemo(() => {
    const a = diffStats(lyricsOps)
    const b = diffStats(chordsOps)
    return { added: a.added + b.added, removed: a.removed + b.removed }
  }, [lyricsOps, chordsOps])
  const sections = [
    { key: 'lyrics', ops: lyricsOps },
    { key: 'chords', ops: chordsOps }
  ].filter((sec) => sec.ops.some((op) => op.type !== 'same'))

  return (
    <div className="version-block">
      <div className="version-item">
        <div className="version-info">
          <div className="version-label">
            {v.kind === 'auto' && <span className="badge badge-auto">{t('versions.auto')}</span>} {v.label}{' '}
            {sameAsCurrent && <span className="badge">{t('versions.matchesCurrent')}</span>}
          </div>
          <div className="version-date">{formatDbDate(v.created_at)}</div>
        </div>
        <button className="btn" onClick={onToggle} aria-expanded={open}>
          {open ? '▾' : '▸'} {t('versions.diff')}
        </button>
        <button className="btn" onClick={onRestore} disabled={sameAsCurrent}>
          ↩ {t('versions.restore')}
        </button>
        <button className="btn btn-danger" onClick={onDelete} aria-label={t('versions.delete')}>
          🗑
        </button>
      </div>
      {open && (
        <div className="diff">
          <div className="hint">
            {sameAsCurrent
              ? t('versions.noDiff')
              : t('versions.diffSummary', { added: stats.added, removed: stats.removed })}
          </div>
          {!sameAsCurrent &&
            sections.map((sec) => (
              <div key={sec.key}>
                <div className="diff-title">{t(`editor.tab.${sec.key}`)}</div>
                {sec.ops.map((op, i) => (
                  <div key={i} className={`diff-line diff-${op.type}`}>
                    <span className="diff-mark">{op.type === 'add' ? '+' : op.type === 'del' ? '−' : ' '}</span>
                    {op.text || ' '}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
