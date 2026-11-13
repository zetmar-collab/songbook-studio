import { describe, expect, it } from 'vitest'
import { highlightRanges, makeSnippet, normalizeText, queryTokens } from '../src/shared/text'
import { diffLines, diffStats } from '../src/shared/diff'
import { parseChordPro, parsePlainText, songToChordPro } from '../src/shared/chordpro'
import { toSunoLyrics, translateSectionLabel } from '../src/shared/suno'

describe('normalizeText', () => {
  it('składa polskie znaki, także ł (regresja: lodz/zolc nic nie znajdowało)', () => {
    expect(normalizeText('Łódź żółć błękit Ćma światła')).toBe('lodz zolc blekit cma swiatla')
  })
  it('składa znaki innych języków', () => {
    expect(normalizeText('Ærø straße Œuvre')).toBe('aero strasse oeuvre')
  })
  it('zwija białe znaki', () => {
    expect(normalizeText('  a \n\t b ')).toBe('a b')
  })
})

describe('queryTokens', () => {
  it('dzieli i normalizuje zapytanie', () => {
    expect(queryTokens('  Idę  PRZEZ ')).toEqual(['ide', 'przez'])
    expect(queryTokens('   ')).toEqual([])
  })
  it('obcina interpunkcję z brzegów, ale zostawia tokeny złożone ze znaków specjalnych', () => {
    expect(queryTokens('"Rzeka," [Am]')).toEqual(['rzeka', 'am'])
    expect(queryTokens('F#m %')).toEqual(['f#m', '%'])
  })
})

describe('highlightRanges', () => {
  it('zwraca zakresy w ORYGINALNYM tekście mimo składania znaków', () => {
    const text = 'Idę przez ulice miasta'
    const r = highlightRanges(text, ['ide'])
    expect(r).toEqual([[0, 3]])
    expect(text.slice(r[0][0], r[0][1])).toBe('Idę')
  })
  it('znajduje fragmenty w środku słowa i łączy zakresy', () => {
    expect(highlightRanges('miasta', ['iast'])).toEqual([[1, 5]])
    expect(highlightRanges('aaaa', ['aa'])).toEqual([[0, 4]])
  })
  it('trafia w znaki ze zmienioną długością (ß→ss)', () => {
    const text = 'Straße'
    const r = highlightRanges(text, ['ss'])
    expect(text.slice(r[0][0], r[0][1])).toBe('ß')
  })
})

describe('makeSnippet', () => {
  it('wycina fragment wokół trafienia i przesuwa zakresy', () => {
    const s = makeSnippet('pierwsza linia\nIdę przez ulice miasta i dalej', ['ulice'], 6)
    expect(s).not.toBeNull()
    expect(s!.text.startsWith('…')).toBe(true)
    const [a, b] = s!.ranges[0]
    expect(s!.text.slice(a, b)).toBe('ulice')
  })
  it('zwraca null, gdy nic nie pasuje', () => {
    expect(makeSnippet('abc', ['xyz'])).toBeNull()
  })
})

describe('diffLines', () => {
  it('rozpoznaje dodane, usunięte i niezmienione linie', () => {
    const ops = diffLines('a\nb\nc', 'a\nx\nc\nd')
    expect(ops).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
      { type: 'add', text: 'd' }
    ])
    expect(diffStats(ops)).toEqual({ added: 2, removed: 1 })
  })
  it('identyczne teksty nie mają zmian', () => {
    expect(diffStats(diffLines('x\ny', 'x\ny'))).toEqual({ added: 0, removed: 0 })
  })
})

describe('ChordPro', () => {
  const src = `{title: Światła miasta}
{artist: Nocny Kolektyw}
{key: Am}
{capo: 2}
# komentarz pliku
{start_of_verse}
[Am]Idę przez [F]ulice
{end_of_verse}
{comment: Refren}
[C]gdzie neony [G]gasną
`
  it('czyta dyrektywy i treść', () => {
    const p = parseChordPro(src)
    expect(p.title).toBe('Światła miasta')
    expect(p.artist).toBe('Nocny Kolektyw')
    expect(p.key).toBe('Am')
    expect(p.notes).toBe('Kapodaster: 2')
    expect(p.chords).toContain('[Zwrotka]')
    expect(p.chords).toContain('[Am]Idę przez [F]ulice')
    expect(p.chords).toContain('[Refren]')
    expect(p.lyrics).toContain('Idę przez ulice')
    expect(p.lyrics).not.toContain('[Am]')
    expect(p.lyrics).not.toMatch(/komentarz/)
  })
  it('plik bez akordów trafia wyłącznie do tekstu', () => {
    const p = parseChordPro('{title: X}\nzwykły tekst')
    expect(p.chords).toBe('')
    expect(p.lyrics).toBe('zwykły tekst')
  })
  it('konwertuje klasyczny zapis akordów nad tekstem', () => {
    const p = parsePlainText('Am        F\nIdę przez ulice\nC     G\ngdzie neony')
    expect(p.chords).toBe('[Am]Idę przez [F]ulice\n[C]gdzie [G]neony')
    expect(p.lyrics).toBe('Idę przez ulice\ngdzie neony')
  })
  it('przechodzi round-trip eksport → import', () => {
    const song = { title: 'T', artist: 'A', key: 'Am', tags: '', notes: '', lyrics: 'la la', chords: '[Refren]\n[Am]la [F]la' }
    const text = songToChordPro(song)
    expect(text).toContain('{comment: Refren}')
    const back = parseChordPro(text)
    expect(back.title).toBe('T')
    expect(back.chords).toBe('[Refren]\n[Am]la [F]la')
  })
})

describe('Suno', () => {
  it('tłumaczy etykiety sekcji', () => {
    expect(translateSectionLabel('Zwrotka 2')).toBe('Verse 2')
    expect(translateSectionLabel('Refren')).toBe('Chorus')
    expect(translateSectionLabel('Wstęp')).toBe('Intro')
    expect(translateSectionLabel('Coś innego')).toBe('Coś innego')
  })
  it('usuwa akordy i opcjonalnie tłumaczy etykiety', () => {
    const src = '[Zwrotka 1]\n[Am]Idę przez [F]ulice\n\n[Refren]\n[C]la la'
    expect(toSunoLyrics(src, true)).toBe('[Verse 1]\nIdę przez ulice\n\n[Chorus]\nla la')
    expect(toSunoLyrics(src, false)).toBe('[Zwrotka 1]\nIdę przez ulice\n\n[Refren]\nla la')
  })
})
