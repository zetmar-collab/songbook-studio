import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChordSheet from './ChordSheet'

export interface StageItem {
  title: string
  artist: string
  key: string
  /** Treść do pokazania (akordy lub sam tekst), już po ewentualnej transpozycji. */
  text: string
}

interface Props {
  items: StageItem[]
  index: number
  onClose: () => void
}

const MIN_SIZE = 14
const MAX_SIZE = 72

function loadNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}

function saveNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* ustawienie tylko na tę sesję */
  }
}

/** Pełnoekranowy widok do grania na żywo: duża czcionka, autoprzewijanie, nawigacja po setliście. */
export default function StageMode({ items, index: startIndex, onClose }: Props): JSX.Element {
  const { t } = useTranslation()
  const [index, setIndex] = useState(startIndex)
  const [size, setSize] = useState(() => loadNumber('stageFont', 28))
  const [speed, setSpeed] = useState(() => loadNumber('stageSpeed', 20)) // piksele na sekundę
  const [scrolling, setScrolling] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const item = items[index]

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta)))
      setScrolling(false)
      bodyRef.current?.scrollTo({ top: 0 })
    },
    [items.length]
  )

  const changeSize = useCallback((delta: number) => {
    setSize((s) => {
      const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, s + delta))
      saveNumber('stageFont', next)
      return next
    })
  }, [])

  const changeSpeed = useCallback((delta: number) => {
    setSpeed((s) => {
      const next = Math.min(120, Math.max(5, s + delta))
      saveNumber('stageSpeed', next)
      return next
    })
  }, [])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // Autoprzewijanie: ułamkowe piksele kumulujemy, bo scrollTop zaokrągla do całkowitych
  useEffect(() => {
    if (!scrolling) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number): void => {
      acc += ((now - last) / 1000) * speed
      last = now
      const el = bodyRef.current
      if (el) {
        const whole = Math.floor(acc)
        if (whole > 0) {
          el.scrollTop += whole
          acc -= whole
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
          setScrolling(false)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scrolling, speed])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1)
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
    else if (e.key === ' ') {
      e.preventDefault()
      setScrolling((s) => !s)
    } else if (e.key === '+' || e.key === '=') changeSize(2)
    else if (e.key === '-') changeSize(-2)
    else return
    e.stopPropagation()
  }

  if (!item) return <></>

  return (
    <div
      className="stage"
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('stage.title')}
      onKeyDown={onKeyDown}
    >
      <div className="stage-bar">
        <button className="btn" onClick={() => go(-1)} disabled={index === 0} aria-label={t('stage.prev')}>
          ◀
        </button>
        <div className="stage-title">
          <strong>{item.title || t('editor.titlePlaceholder')}</strong>
          <span>
            {[item.artist, item.key && `${t('editor.key')}: ${item.key}`].filter(Boolean).join(' · ')}
            {items.length > 1 && ` · ${index + 1}/${items.length}`}
          </span>
        </div>
        <button className="btn" onClick={() => go(1)} disabled={index >= items.length - 1} aria-label={t('stage.next')}>
          ▶
        </button>
        <div className="spacer" />
        <button className="btn" onClick={() => changeSize(-2)} aria-label={t('stage.smaller')}>
          A−
        </button>
        <span className="hint">{size}</span>
        <button className="btn" onClick={() => changeSize(2)} aria-label={t('stage.bigger')}>
          A+
        </button>
        <button className={`btn ${scrolling ? 'btn-primary' : ''}`} onClick={() => setScrolling((s) => !s)}>
          {scrolling ? '⏸' : '▶'} {t('stage.scroll')}
        </button>
        <button className="btn" onClick={() => changeSpeed(-5)} aria-label={t('stage.slower')}>
          🐢
        </button>
        <button className="btn" onClick={() => changeSpeed(5)} aria-label={t('stage.faster')}>
          🐇
        </button>
        <button className="btn btn-danger" onClick={onClose}>
          ✕ {t('stage.close')}
        </button>
      </div>
      <div className="stage-body" ref={bodyRef}>
        <ChordSheet text={item.text} style={{ fontSize: size }} />
        <div style={{ height: '60vh' }} />
      </div>
      <div className="stage-hint">{t('stage.keys')}</div>
    </div>
  )
}
