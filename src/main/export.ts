// Eksport utworów i kolekcji (cały śpiewnik, setlista) do PDF, DOCX, Markdown oraz ChordPro.
// W PDF/DOCX/Markdown akordy są układane nad tekstem — tak, jak gra się z kartki.
import { app, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { chordsAbove } from '../shared/chords'
import { songToChordPro } from '../shared/chordpro'
import type { ExportFormat, Lang, Song } from '../shared/types'
import { strings } from './exportStrings'

export type ExportSong = Pick<Song, 'title' | 'artist' | 'key' | 'tags' | 'notes' | 'lyrics' | 'chords'>

const MONO = 'Consolas'

function bodyOf(song: ExportSong): string {
  return (song.chords.trim() ? song.chords : song.lyrics) || ''
}

function metaLine(song: ExportSong, lang: Lang, sep: string): string {
  const s = strings(lang)
  const meta: string[] = []
  if (song.key) meta.push(`${s.key}: ${song.key}`)
  if (song.tags) meta.push(`${s.tags}: ${song.tags}`)
  return meta.join(sep)
}

/** Linie tekstu z akordami nad słowami (do plików tekstowych). */
export function plainLines(song: ExportSong): string[] {
  const out: string[] = []
  for (const l of chordsAbove(bodyOf(song))) {
    if (l.kind === 'text') out.push(l.text)
    else if (l.kind === 'label') out.push(`[${l.text}]`)
    else {
      if (l.chords.trim()) out.push(l.chords)
      if (l.lyric.trim() || !l.chords.trim()) out.push(l.lyric)
    }
  }
  return out
}

function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

// ---------- Markdown ----------

export function songToMarkdown(song: ExportSong, lang: Lang, level = 1): string {
  const s = strings(lang)
  const h = '#'.repeat(level)
  const lines: string[] = [`${h} ${song.title || s.untitled}`]
  if (song.artist) lines.push(`**${song.artist}**`)
  const meta = metaLine(song, lang, ' · ')
  if (meta) lines.push(`\n_${meta}_`)
  lines.push('')
  const body = plainLines(song).join('\n')
  const fence = fenceFor(body)
  lines.push(fence, body, fence)
  if (song.notes.trim()) {
    lines.push('', `${h}# ${s.notes}`, '', song.notes)
  }
  return lines.join('\n')
}

// ---------- HTML / PDF ----------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function bodyHtml(song: ExportSong): string {
  const out: string[] = []
  for (const l of chordsAbove(bodyOf(song))) {
    if (l.kind === 'text') out.push(escapeHtml(l.text))
    else if (l.kind === 'label') out.push(`<span class="lab">${escapeHtml(l.text)}</span>`)
    else {
      if (l.chords.trim()) out.push(`<span class="chord">${escapeHtml(l.chords)}</span>`)
      if (l.lyric.trim() || !l.chords.trim()) out.push(escapeHtml(l.lyric))
    }
  }
  return out.join('\n')
}

function songHtml(song: ExportSong, lang: Lang, index?: number): string {
  const s = strings(lang)
  const meta = metaLine(song, lang, '  •  ')
  const title = (index !== undefined ? `${index + 1}. ` : '') + (song.title || s.untitled)
  return `
  <section class="song"${index !== undefined ? ` id="s${index}"` : ''}>
    <h1>${escapeHtml(title)}</h1>
    ${song.artist ? `<p class="artist">${escapeHtml(song.artist)}</p>` : ''}
    ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ''}
    <pre>${bodyHtml(song)}</pre>
    ${song.notes.trim() ? `<h2>${escapeHtml(s.notes)}</h2><div class="notes">${escapeHtml(song.notes)}</div>` : ''}
  </section>`
}

const PDF_CSS = `
  @page { margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .artist { font-style: italic; font-size: 15px; color: #444; margin: 0 0 6px; }
  .meta { font-size: 12px; color: #888; margin: 0 0 16px; }
  pre { font-family: 'Consolas', 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
  .chord { font-weight: bold; color: #1d4ed8; }
  .lab { font-weight: bold; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; color: #555; }
  h2 { font-size: 15px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
  .notes { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
  .cover { text-align: center; padding-top: 30%; }
  .cover h1 { font-size: 40px; margin: 0; }
  .cover p { color: #666; font-size: 15px; }
  .toc { page-break-before: always; }
  .toc h2 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 0; }
  .toc ol { padding-left: 24px; }
  .toc li { padding: 4px 0; border-bottom: 1px dotted #ccc; }
  .toc a { color: inherit; text-decoration: none; font-weight: bold; }
  .toc .toc-a { color: #777; margin-left: 4px; }
  .song.next { page-break-before: always; }
`

function htmlDoc(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PDF_CSS}</style></head><body>${body}</body></html>`
}

/**
 * Drukuje HTML do PDF. Treść trafia do pliku tymczasowego (a nie do adresu data:, który ma limit długości),
 * a okno nie wykonuje żadnych skryptów.
 */
async function htmlToPdf(html: string, filePath: string): Promise<void> {
  const tmp = join(app.getPath('temp'), `songbook-${randomUUID()}.html`)
  await writeFile(tmp, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  try {
    await win.loadFile(tmp)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(filePath, pdf)
  } finally {
    win.destroy()
    await rm(tmp, { force: true })
  }
}

// ---------- DOCX ----------

function songParagraphs(song: ExportSong, lang: Lang, heading: (typeof HeadingLevel)[keyof typeof HeadingLevel], index?: number): Paragraph[] {
  const s = strings(lang)
  const title = (index !== undefined ? `${index + 1}. ` : '') + (song.title || s.untitled)
  const out: Paragraph[] = [
    new Paragraph({ text: title, heading, pageBreakBefore: index !== undefined })
  ]
  if (song.artist) {
    out.push(new Paragraph({ children: [new TextRun({ text: song.artist, italics: true, size: 24 })] }))
  }
  const meta = metaLine(song, lang, '  •  ')
  if (meta) out.push(new Paragraph({ children: [new TextRun({ text: meta, color: '888888', size: 20 })] }))
  out.push(new Paragraph({ text: '' }))

  for (const l of chordsAbove(bodyOf(song))) {
    if (l.kind === 'text') {
      out.push(new Paragraph({ children: [new TextRun({ text: l.text, font: MONO, size: 22 })] }))
    } else if (l.kind === 'label') {
      out.push(new Paragraph({ children: [new TextRun({ text: l.text.toUpperCase(), font: MONO, size: 18, bold: true, color: '555555' })] }))
    } else {
      if (l.chords.trim()) {
        out.push(new Paragraph({ children: [new TextRun({ text: l.chords, font: MONO, size: 22, bold: true, color: '1D4ED8' })] }))
      }
      if (l.lyric.trim() || !l.chords.trim()) {
        out.push(new Paragraph({ children: [new TextRun({ text: l.lyric, font: MONO, size: 22 })] }))
      }
    }
  }

  if (song.notes.trim()) {
    out.push(new Paragraph({ text: '' }))
    out.push(new Paragraph({ text: s.notes, heading: HeadingLevel.HEADING_2 }))
    for (const line of song.notes.split('\n')) out.push(new Paragraph({ text: line }))
  }
  return out
}

// ---------- Publiczne API ----------

export async function exportSong(
  song: ExportSong,
  format: ExportFormat | 'cho',
  filePath: string,
  lang: Lang
): Promise<void> {
  if (format === 'md') {
    await writeFile(filePath, songToMarkdown(song, lang) + '\n', 'utf8')
  } else if (format === 'cho') {
    await writeFile(filePath, songToChordPro(song), 'utf8')
  } else if (format === 'docx') {
    const doc = new Document({
      creator: 'Songbook Studio',
      title: song.title,
      sections: [{ children: songParagraphs(song, lang, HeadingLevel.HEADING_1) }]
    })
    await writeFile(filePath, await Packer.toBuffer(doc))
  } else {
    await htmlToPdf(htmlDoc(songHtml(song, lang)), filePath)
  }
}

/** Cały śpiewnik albo setlista: okładka, spis treści (z odnośnikami) i kolejne utwory. */
export async function exportCollection(
  songs: ExportSong[],
  title: string,
  format: ExportFormat,
  filePath: string,
  lang: Lang
): Promise<void> {
  const s = strings(lang)
  const date = new Date().toLocaleDateString(s.locale)
  const subtitle = `${s.songs(songs.length)} · ${date}`

  if (format === 'md') {
    const parts = [`# 🎵 ${title}\n\n_${subtitle}_\n`, `\n## ${s.toc}\n`]
    songs.forEach((song, i) => {
      parts.push(`${i + 1}. ${song.title || s.untitled}${song.artist ? ` — ${song.artist}` : ''}`)
    })
    parts.push('\n---\n')
    songs.forEach((song, i) => {
      parts.push('\n' + songToMarkdown({ ...song, title: `${i + 1}. ${song.title || s.untitled}` }, lang, 2) + '\n')
    })
    await writeFile(filePath, parts.join('\n'), 'utf8')
    return
  }

  if (format === 'docx') {
    const children: Paragraph[] = [
      new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: subtitle, italics: true, color: '888888' })] }),
      new Paragraph({ text: s.toc, heading: HeadingLevel.HEADING_2 }),
      ...songs.map(
        (song, i) =>
          new Paragraph({ text: `${i + 1}. ${song.title || s.untitled}${song.artist ? ` — ${song.artist}` : ''}` })
      )
    ]
    songs.forEach((song, i) => children.push(...songParagraphs(song, lang, HeadingLevel.HEADING_2, i)))
    const doc = new Document({ creator: 'Songbook Studio', title, sections: [{ children }] })
    await writeFile(filePath, await Packer.toBuffer(doc))
    return
  }

  const toc = songs
    .map(
      (song, i) =>
        `<li><a href="#s${i}">${escapeHtml(song.title || s.untitled)}</a>${
          song.artist ? `<span class="toc-a">— ${escapeHtml(song.artist)}</span>` : ''
        }</li>`
    )
    .join('')
  const body = `
    <div class="cover"><h1>🎵 ${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
    <div class="toc"><h2>${escapeHtml(s.toc)}</h2><ol>${toc}</ol></div>
    ${songs.map((song, i) => songHtml(song, lang, i).replace('class="song"', 'class="song next"')).join('')}`
  await htmlToPdf(htmlDoc(body), filePath)
}
