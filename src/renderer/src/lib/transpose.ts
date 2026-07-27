// Transpozycja akordów zapisanych w nawiasach kwadratowych, np. "[C]Hello [G/B]world".
// Obsługuje krzyżyki (#) i bemole (b), akordy złożone (Am7, Csus4) oraz bas po "/".

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_TO_INDEX: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11
}

function transposeNote(note: string, semitones: number, preferFlat: boolean): string {
  const idx = NOTE_TO_INDEX[note]
  if (idx === undefined) return note
  const next = (((idx + semitones) % 12) + 12) % 12
  return preferFlat ? FLAT[next] : SHARP[next]
}

/** Transponuje pojedynczy token akordu, np. "F#m7/A#". */
export function transposeChord(chord: string, semitones: number): string {
  const preferFlat = chord.includes('b') && !/[A-G]#/.test(chord)
  return chord.replace(/([A-G])([#b]?)([^/\s]*)(\/([A-G])([#b]?))?/, (_all, root, acc, rest, bassGroup) => {
    const newRoot = transposeNote(root + acc, semitones, preferFlat)
    let result = newRoot + rest
    if (bassGroup) {
      const bassMatch = bassGroup.match(/\/([A-G])([#b]?)/)
      if (bassMatch) {
        const newBass = transposeNote(bassMatch[1] + bassMatch[2], semitones, preferFlat)
        result += '/' + newBass
      }
    }
    return result
  })
}

/** Transponuje wszystkie akordy w nawiasach [ ] w podanym tekście. */
export function transposeBracketed(text: string, semitones: number): string {
  if (semitones === 0) return text
  return text.replace(/\[([^\]]+)\]/g, (_m, chord) => `[${transposeChord(chord, semitones)}]`)
}

/** Transponuje pojedynczą nazwę tonacji, np. "Am" lub "C#". */
export function transposeKey(key: string, semitones: number): string {
  const trimmed = key.trim()
  if (!trimmed) return key
  return transposeChord(trimmed, semitones)
}
