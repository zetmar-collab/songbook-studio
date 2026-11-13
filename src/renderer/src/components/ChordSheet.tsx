import { useMemo } from 'react'
import { chordsAbove } from '../../../shared/chords'

/** Akordy nad słowami — tak, jak gra się z kartki. Używane w podglądzie i w trybie scenicznym. */
export default function ChordSheet({ text, style }: { text: string; style?: React.CSSProperties }): JSX.Element {
  const lines = useMemo(() => chordsAbove(text), [text])
  return (
    <div className="chord-sheet" style={style}>
      {lines.map((l, i) => {
        if (l.kind === 'label') {
          return (
            <div key={i} className="cs-label">
              {l.text}
            </div>
          )
        }
        if (l.kind === 'text') {
          return (
            <div key={i} className="cs-line">
              {l.text || ' '}
            </div>
          )
        }
        return (
          <div key={i}>
            {l.chords.trim() && <div className="cs-chords">{l.chords}</div>}
            {(l.lyric.trim() || !l.chords.trim()) && <div className="cs-line">{l.lyric || ' '}</div>}
          </div>
        )
      })}
    </div>
  )
}
