import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import { inflateRawSync } from 'zlib'

/**
 * Wyciąga tekst z pliku .docx bez zewnętrznych zależności.
 * .docx to archiwum ZIP; interesuje nas wpis `word/document.xml`.
 * Parsujemy centralny katalog ZIP, dekompresujemy wpis (deflate)
 * i zamieniamy XML Worda na czysty tekst z zachowaniem podziału na linie.
 */
export async function importDocxText(filePath: string): Promise<{ title: string; text: string }> {
  const buf = await readFile(filePath)
  const xml = extractZipEntry(buf, 'word/document.xml')
  if (!xml) throw new Error('To nie jest poprawny plik .docx (brak word/document.xml).')
  const text = docxXmlToText(xml.toString('utf-8'))
  const title = basename(filePath, extname(filePath))
  return { title, text }
}

function extractZipEntry(buf: Buffer, name: string): Buffer | null {
  // Znajdź End Of Central Directory (EOCD): sygnatura PK\x05\x06
  const EOCD_SIG = 0x06054b50
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const cdCount = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16) // offset centralnego katalogu

  const CEN_SIG = 0x02014b50
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(ptr) !== CEN_SIG) break
    const method = buf.readUInt16LE(ptr + 10)
    const compSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const entryName = buf.toString('utf-8', ptr + 46, ptr + 46 + nameLen)

    if (entryName === name) {
      // Przejdź do lokalnego nagłówka aby odczytać jego długości
      const lNameLen = buf.readUInt16LE(localOffset + 26)
      const lExtraLen = buf.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + lNameLen + lExtraLen
      const compData = buf.subarray(dataStart, dataStart + compSize)
      if (method === 0) return Buffer.from(compData) // brak kompresji
      if (method === 8) return inflateRawSync(compData) // deflate
      throw new Error(`Nieobsługiwana metoda kompresji ZIP: ${method}`)
    }
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function docxXmlToText(xml: string): string {
  let out = xml
    // każdy akapit kończy się pojedynczym podziałem wiersza
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<w:tab\s*\/?>/g, '\t')

  // wyciągnij tylko zawartość <w:t>...</w:t>
  const parts: string[] = []
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  let lastIndex = 0
  const rebuilt: string[] = []
  while ((m = re.exec(out)) !== null) {
    // zachowaj znaki nowej linii pojawiające się między runami
    const between = out.slice(lastIndex, m.index)
    const newlines = (between.match(/\n/g) || []).join('')
    rebuilt.push(newlines)
    rebuilt.push(decodeEntities(m[1]))
    lastIndex = re.lastIndex
  }
  const tail = out.slice(lastIndex)
  rebuilt.push((tail.match(/\n/g) || []).join(''))

  const text = rebuilt.join('')
  // uporządkuj nadmiarowe puste linie
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
