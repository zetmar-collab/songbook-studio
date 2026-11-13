// Import utworów z plików: .docx, .txt/.md/.crd (także akordy nad tekstem) oraz ChordPro.
import { readFile, stat } from 'fs/promises'
import { basename, extname } from 'path'
import { parseChordPro, parsePlainText, type ParsedSong } from '../shared/chordpro'
import { readZipEntry } from './zip'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_DOCUMENT_XML = 64 * 1024 * 1024

export const IMPORT_EXTENSIONS = ['docx', 'txt', 'md', 'crd', 'cho', 'chordpro', 'pro']

// ---------- DOCX ----------

function decodeEntities(s: string): string {
  const cp = (n: number): string => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '')
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => cp(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Zamienia XML Worda na zwykły tekst. Rozpoznaje WYŁĄCZNIE znaczniki tekstu (<w:t>),
 * tabulacji (<w:tab/>), łamania wiersza oraz końce akapitów i komórek tabeli —
 * wszystko inne (np. <w:tabs>, <w:tbl>, <w:tcW>) jest ignorowane.
 */
export function docxXmlToText(xml: string): string {
  const parts: string[] = []
  const re =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<\/w:p>|<\/w:tc>|<\/w:tr>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0]
    if (m[1] !== undefined) parts.push(decodeEntities(m[1]))
    else if (tag.startsWith('<w:tab')) parts.push('\t')
    else if (tag.startsWith('<w:br') || tag.startsWith('<w:cr')) parts.push('\n')
    else if (tag === '</w:p>') parts.push('\n')
    else if (tag === '</w:tc>') {
      if (parts[parts.length - 1] === '\n') parts.pop()
      parts.push('\t')
    } else if (tag === '</w:tr>') {
      if (parts[parts.length - 1] === '\t') parts.pop()
      if (parts[parts.length - 1] !== '\n') parts.push('\n')
    }
  }
  return parts
    .join('')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function importDocxText(filePath: string): Promise<{ title: string; text: string }> {
  const buf = await readFile(filePath)
  const xml = readZipEntry(buf, 'word/document.xml', { maxEntryBytes: MAX_DOCUMENT_XML })
  if (!xml) throw new Error('To nie jest poprawny plik .docx (brak word/document.xml).')
  return { title: basename(filePath, extname(filePath)), text: docxXmlToText(xml.toString('utf-8')) }
}

// ---------- Pliki tekstowe ----------

/** UTF-8 / UTF-16 (z BOM) z awaryjnym odczytem w Windows-1250 (starsze polskie pliki). */
export function decodeText(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2)
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2, 2 + ((buf.length - 2) & ~1)))
    swapped.swap16()
    return swapped.toString('utf16le')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1250').decode(buf)
  }
}

function looksLikeChordPro(text: string): boolean {
  return /^\s*\{\s*(title|t|subtitle|st|artist|key|start_of_\w+|so[cvb])\b/im.test(text)
}

// ---------- Import wielu plików ----------

export interface ImportedItem {
  fileName: string
  song: ParsedSong
}

export interface ImportResult {
  items: ImportedItem[]
  failed: Array<{ fileName: string; error: string }>
}

export async function importFiles(paths: string[]): Promise<ImportResult> {
  const result: ImportResult = { items: [], failed: [] }
  for (const filePath of paths) {
    const fileName = basename(filePath)
    try {
      const ext = extname(filePath).slice(1).toLowerCase()
      if (!IMPORT_EXTENSIONS.includes(ext)) throw new Error('Nieobsługiwany typ pliku.')
      const info = await stat(filePath)
      if (info.size > MAX_FILE_BYTES) throw new Error('Plik jest za duży (limit 20 MB).')

      let song: ParsedSong
      if (ext === 'docx') {
        const { text } = await importDocxText(filePath)
        song = parsePlainText(text)
      } else {
        const text = decodeText(await readFile(filePath))
        const chordPro = ['cho', 'chordpro', 'pro'].includes(ext) || looksLikeChordPro(text)
        song = chordPro ? parseChordPro(text) : parsePlainText(text)
      }
      if (!song.title) song.title = basename(filePath, extname(filePath))
      result.items.push({ fileName, song })
    } catch (e) {
      result.failed.push({ fileName, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return result
}
