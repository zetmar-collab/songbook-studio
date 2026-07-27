import { BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType
} from 'docx'
import type { Song } from './db'

/** Buduje treść utworu jako Markdown. */
export function songToMarkdown(song: Song): string {
  const lines: string[] = []
  lines.push(`# ${song.title || 'Bez tytułu'}`)
  if (song.artist) lines.push(`**${song.artist}**`)
  const meta: string[] = []
  if (song.key) meta.push(`Tonacja: ${song.key}`)
  if (song.tags) meta.push(`Tagi: ${song.tags}`)
  if (meta.length) lines.push(`\n_${meta.join(' · ')}_`)
  lines.push('')

  const body = song.chords?.trim() ? song.chords : song.lyrics
  lines.push('```')
  lines.push(body || '')
  lines.push('```')

  if (song.notes?.trim()) {
    lines.push('')
    lines.push('## Notatki')
    lines.push('')
    lines.push(song.notes)
  }
  return lines.join('\n')
}

export async function exportMarkdown(song: Song, filePath: string): Promise<void> {
  await writeFile(filePath, songToMarkdown(song), 'utf-8')
}

export async function exportDocx(song: Song, filePath: string): Promise<void> {
  const children: Paragraph[] = []

  children.push(
    new Paragraph({
      text: song.title || 'Bez tytułu',
      heading: HeadingLevel.HEADING_1
    })
  )
  if (song.artist) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: song.artist, italics: true, size: 24 })]
      })
    )
  }
  const meta: string[] = []
  if (song.key) meta.push(`Tonacja: ${song.key}`)
  if (song.tags) meta.push(`Tagi: ${song.tags}`)
  if (meta.length) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: meta.join('  •  '), color: '888888', size: 20 })]
      })
    )
  }
  children.push(new Paragraph({ text: '' }))

  const body = (song.chords?.trim() ? song.chords : song.lyrics) || ''
  for (const line of body.split('\n')) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Consolas', size: 22 })]
      })
    )
  }

  if (song.notes?.trim()) {
    children.push(new Paragraph({ text: '' }))
    children.push(new Paragraph({ text: 'Notatki', heading: HeadingLevel.HEADING_2 }))
    for (const line of song.notes.split('\n')) {
      children.push(new Paragraph({ text: line }))
    }
  }

  const doc = new Document({
    creator: 'Songbook Studio',
    title: song.title,
    sections: [{ children }]
  })
  const buffer = await Packer.toBuffer(doc)
  await writeFile(filePath, buffer)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Renderuje utwór do PDF przy użyciu wbudowanego printToPDF Electrona (bez dodatkowych zależności). */
export async function exportPdf(song: Song, filePath: string): Promise<void> {
  const body = (song.chords?.trim() ? song.chords : song.lyrics) || ''
  const meta: string[] = []
  if (song.key) meta.push(`Tonacja: ${song.key}`)
  if (song.tags) meta.push(`Tagi: ${song.tags}`)

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .artist { font-style: italic; font-size: 16px; color: #444; margin: 0 0 6px; }
  .meta { font-size: 12px; color: #888; margin: 0 0 18px; }
  pre { font-family: 'Consolas', 'Courier New', monospace; font-size: 13px;
        white-space: pre-wrap; line-height: 1.5; }
  h2 { font-size: 16px; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px; }
  .notes { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
</style></head><body>
  <h1>${escapeHtml(song.title || 'Bez tytułu')}</h1>
  ${song.artist ? `<p class="artist">${escapeHtml(song.artist)}</p>` : ''}
  ${meta.length ? `<p class="meta">${escapeHtml(meta.join('  •  '))}</p>` : ''}
  <pre>${escapeHtml(body)}</pre>
  ${
    song.notes?.trim()
      ? `<h2>Notatki</h2><div class="notes">${escapeHtml(song.notes)}</div>`
      : ''
  }
</body></html>`

  await htmlToPdf(html, filePath)
}

async function htmlToPdf(html: string, filePath: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4'
    })
    await writeFile(filePath, pdf)
  } finally {
    win.destroy()
  }
}

// ---------- Eksport zbiorczy całego katalogu ----------

function songBodyHtml(song: Song): string {
  const body = (song.chords?.trim() ? song.chords : song.lyrics) || ''
  const meta: string[] = []
  if (song.key) meta.push(`Tonacja: ${song.key}`)
  if (song.tags) meta.push(`Tagi: ${song.tags}`)
  return `
  <section class="song">
    <h1>${escapeHtml(song.title || 'Bez tytułu')}</h1>
    ${song.artist ? `<p class="artist">${escapeHtml(song.artist)}</p>` : ''}
    ${meta.length ? `<p class="meta">${escapeHtml(meta.join('  •  '))}</p>` : ''}
    <pre>${escapeHtml(body)}</pre>
    ${song.notes?.trim() ? `<h2>Notatki</h2><div class="notes">${escapeHtml(song.notes)}</div>` : ''}
  </section>`
}

export async function exportAllPdf(songs: Song[], filePath: string): Promise<void> {
  const toc = songs
    .map(
      (s, i) =>
        `<li><span class="toc-t">${escapeHtml(s.title || 'Bez tytułu')}</span>${
          s.artist ? ` <span class="toc-a">— ${escapeHtml(s.artist)}</span>` : ''
        }<span class="toc-n">${i + 1}</span></li>`
    )
    .join('')

  const songsHtml = songs.map(songBodyHtml).join('')

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; }
  .cover { text-align: center; padding-top: 30%; }
  .cover h1 { font-size: 40px; margin: 0; }
  .cover p { color: #666; font-size: 15px; }
  .toc { page-break-before: always; }
  .toc h2 { font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 6px; }
  .toc ol { list-style: none; padding: 0; }
  .toc li { display: flex; align-items: baseline; padding: 5px 0; border-bottom: 1px dotted #ccc; }
  .toc-t { font-weight: bold; }
  .toc-a { color: #777; margin-left: 4px; }
  .toc-n { margin-left: auto; color: #999; }
  .song { page-break-before: always; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .artist { font-style: italic; font-size: 15px; color: #444; margin: 0 0 6px; }
  .meta { font-size: 12px; color: #888; margin: 0 0 16px; }
  pre { font-family: 'Consolas', 'Courier New', monospace; font-size: 13px;
        white-space: pre-wrap; line-height: 1.5; }
  h2 { font-size: 15px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
  .notes { font-size: 13px; white-space: pre-wrap; line-height: 1.5; }
</style></head><body>
  <div class="cover">
    <h1>🎵 Śpiewnik</h1>
    <p>${songs.length} utworów · ${new Date().toLocaleDateString()}</p>
  </div>
  <div class="toc"><h2>Spis treści</h2><ol>${toc}</ol></div>
  ${songsHtml}
</body></html>`

  await htmlToPdf(html, filePath)
}

export async function exportAllMarkdown(songs: Song[], filePath: string): Promise<void> {
  const parts = [`# 🎵 Śpiewnik\n\n_${songs.length} utworów · ${new Date().toLocaleDateString()}_\n`]
  parts.push('\n## Spis treści\n')
  songs.forEach((s, i) => {
    parts.push(`${i + 1}. ${s.title || 'Bez tytułu'}${s.artist ? ` — ${s.artist}` : ''}`)
  })
  parts.push('\n---\n')
  for (const s of songs) {
    parts.push('\n' + songToMarkdown(s) + '\n')
  }
  await writeFile(filePath, parts.join('\n'), 'utf-8')
}

export async function exportAllDocx(songs: Song[], filePath: string): Promise<void> {
  const children: Paragraph[] = []
  children.push(new Paragraph({ text: 'Śpiewnik', heading: HeadingLevel.HEADING_1 }))
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${songs.length} utworów · ${new Date().toLocaleDateString()}`,
          italics: true,
          color: '888888'
        })
      ]
    })
  )

  for (const song of songs) {
    children.push(
      new Paragraph({
        text: song.title || 'Bez tytułu',
        heading: HeadingLevel.HEADING_2,
        pageBreakBefore: true
      })
    )
    if (song.artist) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: song.artist, italics: true })],
          alignment: AlignmentType.LEFT
        })
      )
    }
    const body = (song.chords?.trim() ? song.chords : song.lyrics) || ''
    for (const line of body.split('\n')) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas', size: 22 })] })
      )
    }
  }

  const doc = new Document({ creator: 'Songbook Studio', title: 'Śpiewnik', sections: [{ children }] })
  const buffer = await Packer.toBuffer(doc)
  await writeFile(filePath, buffer)
}
