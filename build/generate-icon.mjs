// Generuje build/icon.ico (256x256, PNG w kontenerze ICO) oraz build/icon.png
// bez zadnych zewnetrznych zaleznosci — tylko Node + wbudowany zlib.
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { renderLogoPng } from './lib/render.mjs'

const png = renderLogoPng({ width: 256, height: 256, mode: 'tile' })

/** Pakuje PNG 256x256 w kontener ICO (jeden wpis). */
function encodeIco(pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // zarezerwowane
  header.writeUInt16LE(1, 2) // typ = ikona
  header.writeUInt16LE(1, 4) // liczba obrazow
  const entry = Buffer.alloc(16)
  entry[0] = 0 // szerokosc 256 zapisuje sie jako 0
  entry[1] = 0 // wysokosc 256 zapisuje sie jako 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bity na piksel
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(6 + 16, 12) // offset danych
  return Buffer.concat([header, entry, pngBuf])
}

const dir = dirname(fileURLToPath(import.meta.url))
const ico = encodeIco(png)
writeFileSync(join(dir, 'icon.png'), png)
writeFileSync(join(dir, 'icon.ico'), ico)
console.log(`icon.png: ${png.length} B, icon.ico: ${ico.length} B`)
