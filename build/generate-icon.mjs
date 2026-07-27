// Generuje build/icon.ico (256x256, PNG w kontenerze ICO) oraz build/icon.png
// bez żadnych zewnętrznych zależności — tylko Node + wbudowany zlib.
import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const SIZE = 256
const SS = 4 // supersampling

// ---- Kolory ----
const c1 = [0x43, 0x61, 0xee] // akcent niebieski
const c2 = [0x8b, 0x5c, 0xf6] // fiolet
const white = [255, 255, 255]

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}

// Zaokrąglony prostokąt (tło)
function inRoundedRect(x, y, s, r) {
  const min = r
  const maxX = s - r
  const maxY = s - r
  let cx = x
  let cy = y
  if (x < min) cx = min
  else if (x > maxX) cx = maxX
  if (y < min) cy = min
  else if (y > maxY) cy = maxY
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1
}

function inRect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by)
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

// Kształt nuty (ósemka) w przestrzeni 256x256
function isNote(x, y) {
  // główka nuty
  if (inEllipse(x, y, 96, 178, 36, 28)) return true
  // laska
  if (inRect(x, y, 124, 58, 137, 182)) return true
  // chorągiewka
  if (inTriangle(x, y, 137, 58, 182, 96, 137, 122)) return true
  return false
}

// ---- Rasteryzacja RGBA ----
const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      aSum = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS
        const py = y + (sy + 0.5) / SS
        if (!inRoundedRect(px, py, SIZE, 52)) {
          // poza tłem — przezroczyste
          continue
        }
        let col
        if (isNote(px, py)) col = white
        else col = lerp(c1, c2, (px + py) / (2 * SIZE))
        rSum += col[0]
        gSum += col[1]
        bSum += col[2]
        aSum += 255
      }
    }
    const n = SS * SS
    const i = (y * SIZE + x) * 4
    pixels[i] = Math.round(rSum / n)
    pixels[i + 1] = Math.round(gSum / n)
    pixels[i + 2] = Math.round(bSum / n)
    pixels[i + 3] = Math.round(aSum / n)
  }
}

// ---- Enkoder PNG ----
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePng(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // dane z bajtem filtra 0 na scanline
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const png = encodePng(pixels, SIZE)

// ---- Kontener ICO (jeden wpis PNG 256x256) ----
function encodeIco(pngBuf) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // typ = ikona
  header.writeUInt16LE(1, 4) // liczba obrazów
  const entry = Buffer.alloc(16)
  entry[0] = 0 // szerokość 256 => 0
  entry[1] = 0 // wysokość 256 => 0
  entry[2] = 0 // paleta
  entry[3] = 0 // reserved
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(6 + 16, 12) // offset
  return Buffer.concat([header, entry, pngBuf])
}

const ico = encodeIco(png)
const dir = dirname(fileURLToPath(import.meta.url))
writeFileSync(join(dir, 'icon.png'), png)
writeFileSync(join(dir, 'icon.ico'), ico)
console.log(`icon.png: ${png.length} B, icon.ico: ${ico.length} B`)
