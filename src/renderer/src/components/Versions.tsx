import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Version } from '../../../preload/index.d'
import type { ToastState } from './Toast'

interface Props {
  songId: number
  onRestored: () => void
  showToast: (t: ToastState) => void
}

export default function Versions({ songId, onRestored, showToast }: Props): JSX.Element {
  const { t } = useTranslation()
  const [versions, setVersions] = useState<Version[]>([])
  const [label, setLabel] = useState('')

  const load = async (): Promise<void> => {
    setVersions(await window.api.versions.list(songId))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  const create = async (): Promise<void> => {
    await window.api.versions.create(songId, label.trim() || new Date().toLocaleString())
    setLabel('')
    await load()
  }

  const restore = async (id: number): Promise<void> => {
    if (!confirm(t('versions.restoreConfirm'))) return
    await window.api.versions.restore(id)
    onRestored()
    showToast({ message: t('versions.restore') + ' ✓' })
  }

  const remove = async (id: number): Promise<void> => {
    await window.api.versions.delete(id)
    await load()
  }

  return (
    <div>
      <div className="voice-controls">
        <input
          style={{ flex: 1 }}
          placeholder={t('versions.labelPlaceholder')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button className="btn btn-primary" onClick={create}>
          💾 {t('versions.create')}
        </button>
      </div>

      {versions.length === 0 && <div className="empty-hint">{t('versions.empty')}</div>}

      {versions.map((v, idx) => (
        <div className="version-item" key={v.id}>
          <div className="version-info">
            <div className="version-label">
              {v.label} {idx === 0 && <span className="badge">{t('versions.current')}</span>}
            </div>
            <div className="version-date">{new Date(v.created_at).toLocaleString()}</div>
          </div>
          <button className="btn" onClick={() => restore(v.id)}>
            ↩ {t('versions.restore')}
          </button>
          <button className="btn btn-danger" onClick={() => remove(v.id)}>
            🗑
          </button>
        </div>
      ))}
    </div>
  )
}
