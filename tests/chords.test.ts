import { describe, expect, it } from 'vitest'
import {
  chordsAbove,
  chordsAboveToInline,
  isChord,
  semitonesBetween,
  stripChords,
  suggestCapo,
  transposeKey,
  transposeText
} from '../src/shared/chords'

describe('isChord', () => {
  it('rozpoznaje akordy', () => {
    for (const c of ['C', 'Am', 'Am7', 'F#m7b5', 'Bb', 'G/B', 'Dsus4', 'Cmaj7', 'E7#9', 'A5', 'C6/9', 'Cm(maj7)']) {
      expect(isChord(c), c).toBe(true)
    }
  })
  it('odrzuca etykiety sekcji i inne słowa', () => {
    for (const c of ['Chorus', 'Bridge', 'Coda', 'Refren', 'Verse', 'N.C.', 'Intro', 'Solo', 'Do', 'Fa']) {
      expect(isChord(c), c).toBe(false)
    }
  })
})

describe('transposeText', () => {
  it('nie rusza etykiet sekcji (regresja: [Chorus]→[Dhorus])', () => {
    const src = '[Chorus]\n[Am]x [F]y\n[Bridge]\n[C]z\n[Coda]\n[N.C.]'
    expect(transposeText(src, 2)).toBe('[Chorus]\n[Bm]x [G]y\n[Bridge]\n[D]z\n[Coda]\n[N.C.]')
  })
  it('zachowuje bas i rozszerzenia', () => {
    expect(transposeText('[F#m/A] [Am7]', 1)).toBe('[Gm/Bb] [Bbm7]') // tonika Am → Bbm, więc bemole
  })
  it('daje spójny zapis w całym utworze (regresja: [G#] [Db] [D#])', () => {
    const out = transposeText('[F] [Bb] [C] [Dm] [F]', 3)
    expect(out).toBe('[Ab] [Db] [Eb] [Fm] [Ab]')
    expect(out).not.toMatch(/#/)
  })
  it('używa zapisu z tonacji docelowej', () => {
    expect(transposeText('[C] [G] [Am] [F]', 1, { targetKey: 'Db' })).toBe('[Db] [Ab] [Bbm] [Gb]')
    expect(transposeText('[C] [G] [Am] [F]', 2, { targetKey: 'D' })).toBe('[D] [A] [Bm] [G]')
  })
  it('0 i 12 półtonów nic nie zmieniają', () => {
    expect(transposeText('[Am] [F]', 0)).toBe('[Am] [F]')
    expect(transposeText('[Am] [F]', 12)).toBe('[Am] [F]')
  })
  it('działa w tył', () => {
    expect(transposeText('[C] [G]', -2)).toBe('[Bb] [F]')
  })
})

describe('tonacje', () => {
  it('transponuje nazwę tonacji', () => {
    expect(transposeKey('Am', 2)).toBe('Bm')
    expect(transposeKey('C', 1)).toBe('Db')
    expect(transposeKey('C major', 2)).toBe('D major')
  })
  it('nie psuje tekstu, który nie jest tonacją (regresja: Dorian→D#orian)', () => {
    expect(transposeKey('Dorian', 1)).toBe('Dorian')
    expect(transposeKey('', 1)).toBe('')
  })
  it('liczy najkrótszy ruch między tonacjami', () => {
    expect(semitonesBetween('C', 'D')).toBe(2)
    expect(semitonesBetween('C', 'A')).toBe(-3)
    expect(semitonesBetween('C', 'F#')).toBe(6)
    expect(semitonesBetween('Am', 'Cm')).toBe(3)
    expect(semitonesBetween('?', 'C')).toBeNull()
  })
})

describe('stripChords / chordsAbove', () => {
  it('usuwa akordy i zostawia etykiety', () => {
    expect(stripChords('[Refren]\n[Am]Idę przez [F]ulice\n[Am] [F]\nkoniec')).toBe(
      '[Refren]\nIdę przez ulice\nkoniec'
    )
  })
  it('układa akordy nad słowami', () => {
    expect(chordsAbove('[Am]Idę przez [F]ulice')).toEqual([
      { kind: 'chords', chords: 'Am        F', lyric: 'Idę przez ulice' }
    ])
  })
  it('rozpoznaje linię z etykietą', () => {
    expect(chordsAbove('[Refren]')).toEqual([{ kind: 'label', text: 'Refren' }])
  })
  it('nie nakłada na siebie sąsiednich akordów', () => {
    expect(chordsAbove('[Am][F]ab')).toEqual([{ kind: 'chords', chords: 'Am F', lyric: 'ab' }])
  })
})

describe('chordsAboveToInline', () => {
  it('scala klasyczny zapis w akordy w nawiasach', () => {
    const src = 'Am        F\nIdę przez ulice\n\nzwykła linia'
    expect(chordsAboveToInline(src)).toBe('[Am]Idę przez [F]ulice\n\nzwykła linia')
  })
  it('nie traktuje pojedynczej litery A jako linii z akordami', () => {
    expect(chordsAboveToInline('A\nja idę')).toBe('A\nja idę')
  })
})

describe('suggestCapo', () => {
  it('podpowiada kapodaster dla trudnych akordów', () => {
    const s = suggestCapo('[F] [Bb] [C] [Dm] [F] [Bb] [C]')
    expect(s).not.toBeNull()
    expect(s!.capo).toBeGreaterThan(0)
    expect(s!.cost).toBeLessThan(s!.baseCost)
  })
  it('milczy, gdy akordy są już łatwe', () => {
    expect(suggestCapo('[C] [G] [Am] [Em] [C] [G]')).toBeNull()
    expect(suggestCapo('[G] [D] [Em] [C]')).toBeNull()
  })
})
