import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat, Song } from '../../../shared/types'
import { highlightRanges, makeSnippet, queryTokens } from '../../../shared/text'
import { stripChords } from '../../../shared/chords'

export type SidebarView = 'songs' | 'setlists'

interface Props {
  songs: Song[]
  selectedId: number | null
  query: string
  view: SidebarView
  onView: (v: SidebarView) => void
  onQuery: (q: string) => void
  onSelect: (id: number) => void
  onCreate: () => void
  onImport: () => void
  onExportAll: (format: ExportFormat) => void
  onOpenSettings: () => void
}

/** Tekst z zaznaczonymi fragmentami pasującymi do zapytania. */
export function Highlighted({
  text,
  ranges
}: {
  text: string
  ranges: Array<[number, number]>
}): JSX.Element {
  if (ranges.length === 0) return <>{text}</>
  const parts: JSX.Element[] = []
  let pos = 0
  ranges.forEach(([a, b], i) => {
    if (a > pos) parts.push(<span key={`t${i}`}>{text.slice(pos, a)}</span>)
    parts.push(<mark key={`m${i}`}>{text.slice(a, b)}</mark>)
    pos = b
  })
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>)
  return <>{parts}</>
}

export default function Sidebar({
  songs,
  selectedId,
  query,
  view,
  onView,
  onQuery,
  onSelect,
  onCreate,
  onImport,
  onExportAll,
  onOpenSettings
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [exportOpen, setExportOpen] = useState(false)

  const tokens = useMemo(() => queryTokens(query), [query])
  const favorites = songs.filter((s) => s.is_favorite)
  const others = songs.filter((s) => !s.is_favorite)
  const searching = tokens.length > 0

  const exportItem = (format: ExportFormat, icon: string): JSX.Element => (
    <button
      onClick={() => {
        setExportOpen(false)
        onExportAll(format)
      }}
    >
      {icon} {t(`exportAll.${format}`)}
    </button>
  )

  const row = (s: Song): JSX.Element => (
    <SongRow key={s.id} song={s} tokens={tokens} active={s.id === selectedId} onClick={() => onSelect(s.id)} />
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-logo" aria-hidden="true">
            🎵
          </div>
          <div>
            <div className="brand-title">{t('app.title')}</div>
            <div className="brand-sub">{t('app.subtitle')}</div>
          </div>
          <div className="brand-actions">
            <div className="dropdown">
              <button
                className="icon-btn"
                title={t('exportAll.title')}
                aria-label={t('exportAll.title')}
                aria-haspopup="menu"
                aria-expanded={exportOpen}
                onClick={() => setExportOpen((v) => !v)}
              >
                📖
              </button>
              {exportOpen && (
                <div className="dropdown-menu" role="menu">
                  <div className="dropdown-title">{t('exportAll.title')}</div>
                  {exportItem('pdf', '📄')}
                  {exportItem('docx', '📝')}
                  {exportItem('md', '⬇')}
                </div>
              )}
            </div>
            <button
              className="icon-btn"
              title={t('settings.title')}
              aria-label={t('settings.title')}
              onClick={onOpenSettings}
            >
              ⚙️
            </button>
          </div>
        </div>

        <div className="seg sidebar-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'songs'}
            className={view === 'songs' ? 'active' : ''}
            onClick={() => onView('songs')}
          >
            🎼 {t('sidebar.songs')}
          </button>
          <button
            role="tab"
            aria-selected={view === 'setlists'}
            className={view === 'setlists' ? 'active' : ''}
            onClick={() => onView('setlists')}
          >
            📋 {t('sidebar.setlists')}
          </button>
        </div>

        {view === 'songs' && (
          <input
            className="search-input"
            type="search"
            aria-label={t('sidebar.search')}
            placeholder={t('sidebar.search')}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        )}
      </div>

      {view === 'songs' ? (
        <>
          <div className="sidebar-buttons">
            <button className="btn-new" onClick={onCreate}>
              ＋ {t('sidebar.newSong')}
            </button>
            <button className="btn-import" onClick={onImport} title={t('sidebar.importHint')}>
              📥 {t('sidebar.import')}
            </button>
          </div>

          <div className="song-list">
            {songs.length === 0 && (
              <div className="empty-hint">
                {query ? t('sidebar.noResults', { query }) : t('sidebar.empty')}
              </div>
            )}
            {searching && songs.length > 0 && (
              <div className="list-section">{t('sidebar.found', { count: songs.length })}</div>
            )}
            {!searching && favorites.length > 0 && (
              <>
                <div className="list-section">★ {t('sidebar.favorites')}</div>
                {favorites.map(row)}
              </>
            )}
            {!searching && others.length > 0 && (
              <>
                {favorites.length > 0 && <div className="list-section">{t('sidebar.songs')}</div>}
                {others.map(row)}
              </>
            )}
            {searching && songs.map(row)}
          </div>
        </>
      ) : (
        <div className="song-list">
          <div className="empty-hint">{t('setlists.sidebarHint')}</div>
        </div>
      )}
    </aside>
  )
}

function SongRow({
  song,
  tokens,
  active,
  onClick
}: {
  song: Song
  tokens: string[]
  active: boolean
  onClick: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const title = song.title?.trim() || t('editor.titlePlaceholder')
  const sub = [song.artist, song.key].filter(Boolean).join(' · ')
  const titleRanges = useMemo(() => highlightRanges(title, tokens), [title, tokens])

  // Fragment tekstu z trafieniem — tylko gdy tytuł i wykonawca nie wyjaśniają, czemu utwór pasuje
  const snippet = useMemo(() => {
    if (tokens.length === 0) return null
    if (titleRanges.length > 0 && highlightRanges(sub, tokens).length === 0 && tokens.length === 1) return null
    return (
      makeSnippet(song.lyrics, tokens) ??
      makeSnippet(stripChords(song.chords), tokens) ??
      makeSnippet(song.notes, tokens)
    )
  }, [song.lyrics, song.chords, song.notes, tokens, titleRanges, sub])

  return (
    <button
      className={`song-item ${active ? 'active' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <div className="song-item-title">
        {song.is_favorite ? '★ ' : ''}
        <Highlighted text={title} ranges={titleRanges} />
      </div>
      {sub && (
        <div className="song-item-sub">
          <Highlighted text={sub} ranges={highlightRanges(sub, tokens)} />
        </div>
      )}
      {snippet && (
        <div className="song-item-snippet">
          <Highlighted text={snippet.text} ranges={snippet.ranges} />
        </div>
      )}
    </button>
  )
}
