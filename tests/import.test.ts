import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TabStopType, TextRun } from 'docx'
import { crc32, listZip, readZip, readZipEntry, writeZip } from '../src/main/zip'
import { decodeText, docxXmlToText, importDocxText, importFiles } from '../src/main/import'

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'sb-import-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function makeDocx(name: string, children: Array<Paragraph | Table>): Promise<string> {
  const p = join(dir, name)
  writeFileSync(p, await Packer.toBuffer(new Document({ sections: [{ children }] })))
  return p
}

describe('zip', () => {
  it('zapisuje i odczytuje wpisy (także z polskimi nazwami i dużymi danymi)', () => {
    const big = Buffer.from('Idę przez ulice miasta. '.repeat(5000))
    const zip = writeZip([
      { name: 'songbook.db', data: Buffer.from('SQLite') },
      { name: 'voice-notes/żółć.webm', data: big },
      { name: 'pusty.txt', data: Buffer.alloc(0) }
    ])
    expect(listZip(zip)).toEqual(['songbook.db', 'voice-notes/żółć.webm', 'pusty.txt'])
    const all = readZip(zip)
    expect(all[1].data.equals(big)).toBe(true)
    expect(all[2].data.length).toBe(0)
    expect(zip.length).toBeLessThan(big.length) // faktycznie skompresowane
    expect(readZipEntry(zip, 'songbook.db')!.toString()).toBe('SQLite')
    expect(readZipEntry(zip, 'nie-ma')).toBeNull()
  })

  it('wykrywa uszkodzone dane przez sumę kontrolną', () => {
    const zip = writeZip([{ name: 'a.txt', data: Buffer.from('abc') }])
    zip[30 + 5] ^= 0xff // zmiana bajtu danych (po nagłówku i nazwie)
    expect(() => readZip(zip)).toThrow(/uszkodzony/i)
  })

  it('odrzuca śmieci i ucięte archiwa', () => {
    expect(() => readZip(Buffer.from('to nie jest zip'))).toThrow()
    const zip = writeZip([{ name: 'a.txt', data: Buffer.from('abc') }])
    expect(() => readZip(zip.subarray(0, zip.length - 10))).toThrow()
  })

  it('egzekwuje limity rozmiaru', () => {
    const zip = writeZip([{ name: 'a.txt', data: Buffer.alloc(1000, 65) }])
    expect(() => readZip(zip, { maxEntryBytes: 100 })).toThrow(/zbyt duży/)
    expect(() => readZip(zip, { maxTotalBytes: 100 })).toThrow(/zbyt duże/)
  })

  it('crc32 zgadza się ze znaną wartością', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
})

describe('import .docx', () => {
  it('czyta zwykłe akapity z polskimi znakami i encjami', async () => {
    const p = await makeDocx('prosty.docx', [
      new Paragraph({ children: [new TextRun('Zwrotka 1')] }),
      new Paragraph({ children: [new TextRun('Ćma leci — żółć & błękit')] })
    ])
    const { text, title } = await importDocxText(p)
    expect(title).toBe('prosty')
    expect(text).toBe('Zwrotka 1\nĆma leci — żółć & błękit')
  })

  it('NIE wkleja surowego XML przy tabulatorach i tabelach (regresja)', async () => {
    const p = await makeDocx('tabela.docx', [
      new Paragraph({ children: [new TextRun('Zwrotka 1')] }),
      new Paragraph({ tabStops: [{ type: TabStopType.LEFT, position: 2000 }], children: [new TextRun('Am\tF\tC')] }),
      new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph('Am  C  G')] }),
              new TableCell({ children: [new Paragraph('Idę przez ulice miasta')] })
            ]
          })
        ]
      }),
      new Paragraph({ children: [new TextRun('Koniec')] })
    ])
    const { text } = await importDocxText(p)
    expect(text).not.toMatch(/<w:|w:val|w:pos/)
    expect(text).toBe('Zwrotka 1\nAm\tF\tC\nAm  C  G\tIdę przez ulice miasta\nKoniec')
  })

  it('dekoduje encje numeryczne', () => {
    expect(docxXmlToText('<w:p><w:r><w:t>l&#8217;amour &#x41;</w:t></w:r></w:p>')).toBe('l’amour A')
  })

  it('zgłasza błąd dla pliku, który nie jest .docx', async () => {
    const p = join(dir, 'falszywy.docx')
    writeFileSync(p, writeZip([{ name: 'inne.xml', data: Buffer.from('x') }]))
    await expect(importDocxText(p)).rejects.toThrow(/nie jest poprawny/)
  })
})

describe('importFiles', () => {
  it('importuje wiele plików naraz i raportuje błędy osobno', async () => {
    const txt = join(dir, 'Rzeka.txt')
    writeFileSync(txt, 'Am       F\nPłyniesz rzeko\n')
    const cho = join(dir, 'Neon.cho')
    writeFileSync(cho, '{title: Neon nocą}\n{artist: Suno demo}\n[C]Nocą świeci [G]neon\n')
    const bad = join(dir, 'obraz.png')
    writeFileSync(bad, 'x')
    const res = await importFiles([txt, cho, bad])
    expect(res.items.map((i) => i.song.title)).toEqual(['Rzeka', 'Neon nocą'])
    expect(res.items[0].song.chords).toBe('[Am]Płyniesz [F]rzeko')
    expect(res.items[1].song.artist).toBe('Suno demo')
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0].fileName).toBe('obraz.png')
  })

  it('czyta starsze polskie pliki w Windows-1250', async () => {
    // „żółć" w CP1250: ż=0xBF ó=0xF3 ł=0xB3 ć=0xE6
    const p = join(dir, 'stary.txt')
    writeFileSync(p, Buffer.from([0xbf, 0xf3, 0xb3, 0xe6, 0x0a]))
    const res = await importFiles([p])
    expect(res.items[0].song.lyrics).toBe('żółć')
  })

  it('rozpoznaje ChordPro także w pliku .txt', async () => {
    const p = join(dir, 'ukryty.txt')
    writeFileSync(p, '{title: Z dyrektywą}\n[Am]la la\n')
    const res = await importFiles([p])
    expect(res.items[0].song.title).toBe('Z dyrektywą')
  })
})

describe('decodeText', () => {
  it('obsługuje UTF-16 z BOM oraz UTF-8', () => {
    expect(decodeText(Buffer.from('﻿Ąbc', 'utf16le'))).toBe('Ąbc')
    expect(decodeText(Buffer.from('Ąbc', 'utf8'))).toBe('Ąbc')
  })
})
