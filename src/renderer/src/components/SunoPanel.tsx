import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../../shared/types'
import { stripChords } from '../../../shared/chords'
import { toSunoLyrics } from '../../../shared/suno'
import type { ToastState } from './Toast'
import { errorMessage } from '../lib/format'

interface Props {
  draft: Song
  update: (patch: Partial<Song>) => void
  showToast: (t: ToastState) => void
}

const STYLE_LIMIT = 1000

/** Przygotowanie utworu dla Suno AI: tekst bez akordów (opcjonalnie z angielskimi tagami sekcji) i pole stylu. */
export default function SunoPanel({ draft, update, showToast }: Props): JSX.Element {
  const { t } = useTranslation()
  const [englishTags, setEnglishTags] = useState(() => {
    try {
      return localStorage.getItem('sunoEnglishTags') !== '0'
    } catch {
      return true
    }
  })

  const source = draft.lyrics.trim() ? draft.lyrics : stripChords(draft.chords)
  const output = useMemo(() => toSunoLyrics(source, englishTags), [source, englishTags])

  const copy = async (text: string, message: string): Promise<void> => {
    try {
      await window.api.clipboard.write(text)
      showToast({ message })
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const toggleTags = (v: boolean): void => {
    setEnglishTags(v)
    try {
      localStorage.setItem('sunoEnglishTags', v ? '1' : '0')
    } catch {
      /* ustawienie tylko na tę sesję */
    }
  }

  return (
    <div className="suno">
      <div className="field">
        <label htmlFor="suno-style">{t('suno.style')}</label>
        <textarea
          id="suno-style"
          rows={3}
          maxLength={STYLE_LIMIT}
          placeholder={t('suno.stylePlaceholder')}
          value={draft.suno_style}
          onChange={(e) => update({ suno_style: e.target.value })}
        />
        <div className="suno-row">
          <span className="hint">
            {draft.suno_style.length}/{STYLE_LIMIT}
          </span>
          <div className="spacer" />
          <button
            className="btn"
            disabled={!draft.suno_style.trim()}
            onClick={() => void copy(draft.suno_style, t('suno.styleCopied'))}
          >
            📋 {t('suno.copyStyle')}
          </button>
        </div>
      </div>

      <div className="field">
        <label>{t('suno.lyrics')}</label>
        <label className="check">
          <input type="checkbox" checked={englishTags} onChange={(e) => toggleTags(e.target.checked)} />
          {t('suno.englishTags')}
        </label>
        <pre className="suno-preview" aria-label={t('suno.lyrics')}>
          {output || t('suno.empty')}
        </pre>
        <div className="suno-row">
          <span className="hint">{t('suno.hint')}</span>
          <div className="spacer" />
          <button
            className="btn btn-primary"
            disabled={!output}
            onClick={() => void copy(output, t('suno.lyricsCopied'))}
          >
            📋 {t('suno.copyLyrics')}
          </button>
        </div>
      </div>
    </div>
  )
}
