import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../../preload/index.d'

interface Props {
  songs: Song[]
  selectedId: number | null
  query: string
  onQuery: (q: string) => void
  onSelect: (id: number) => void
  onCreate: () => void
  onImport: () => void
  onExportAll: (format: 'pdf' | 'docx' | 'md') => void
  onOpenSettings: () => void
}

export default function Sidebar({
  songs,
  selectedId,
  query,
  onQuery,
  onSelect,
  onCreate,
  onImport,
  onExportAll,
  onOpenSettings
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [exportOpen, setExportOpen] = useState(false)

  const favorites = songs.filter((s) => s.is_favorite)
  const others = songs.filter((s) => !s.is_favorite)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-logo">🎵</div>
          <div>
            <div className="brand-title">{t('app.title')}</div>
            <div className="brand-sub">{t('app.subtitle')}</div>
          </div>
          <div className="brand-actions">
            <div className="dropdown">
              <button
                className="icon-btn"
                title={t('exportAll.title')}
                onClick={() => setExportOpen((v) => !v)}
              >
                📖
              </button>
              {exportOpen && (
                <div className="dropdown-menu">
                  <div className="dropdown-title">{t('exportAll.title')}</div>
                  <button
                    onClick={() => {
                      setExportOpen(false)
                      onExportAll('pdf')
                    }}
                  >
                    📄 {t('exportAll.pdf')}
                  </button>
                  <button
                    onClick={() => {
                      setExportOpen(false)
                      onExportAll('docx')
                    }}
                  >
                    📝 {t('exportAll.docx')}
                  </button>
                  <button
                    onClick={() => {
                      setExportOpen(false)
                      onExportAll('md')
                    }}
                  >
                    ⬇ {t('exportAll.md')}
                  </button>
                </div>
              )}
            </div>
            <button className="icon-btn" title={t('settings.title')} onClick={onOpenSettings}>
              ⚙️
            </button>
          </div>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder={t('sidebar.search')}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>

      <div className="sidebar-buttons">
        <button className="btn-new" onClick={onCreate}>
          ＋ {t('sidebar.newSong')}
        </button>
        <button className="btn-import" onClick={onImport} title={t('sidebar.import')}>
          📥 {t('sidebar.import')}
        </button>
      </div>

      <div className="song-list">
        {songs.length === 0 && (
          <div className="empty-hint">
            {query ? t('sidebar.noResults', { query }) : t('sidebar.empty')}
          </div>
        )}

        {favorites.length > 0 && (
          <>
            <div className="list-section">★ {t('sidebar.favorites')}</div>
            {favorites.map((s) => (
              <SongRow
                key={s.id}
                song={s}
                active={s.id === selectedId}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </>
        )}

        {others.length > 0 && (
          <>
            {favorites.length > 0 && <div className="list-section">{t('sidebar.songs')}</div>}
            {others.map((s) => (
              <SongRow
                key={s.id}
                song={s}
                active={s.id === selectedId}
                onClick={() => onSelect(s.id)}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  )
}

function SongRow({
  song,
  active,
  onClick
}: {
  song: Song
  active: boolean
  onClick: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const title = song.title?.trim() || t('editor.titlePlaceholder')
  const sub = [song.artist, song.key].filter(Boolean).join(' · ')
  return (
    <div className={`song-item ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="song-item-title">
        {song.is_favorite ? '★ ' : ''}
        {title}
      </div>
      {sub && <div className="song-item-sub">{sub}</div>}
    </div>
  )
}
