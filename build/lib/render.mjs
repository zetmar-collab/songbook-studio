// Wspolny renderer logo Songbook Studio — bez zewnetrznych zaleznosci (Node + zlib).
// Uzywany przez generate-icon.mjs (ikona .ico/.png) oraz generate-appx-assets.mjs (kafelki MSIX).
import { deflateSync } from 'zlib'

const SS = 4 // supersampling
const C1 = [0x43, 0x61, 0xee] // akcent niebieski
const C2 = [0x8b, 0x5c, 0xf6] // fiolet
const WHITE = [255, 255, 255]

// Ksztalt nuty zdefiniowany w przestrzeni 256x256 (patrz build/generate-icon.mjs).
const BOX = 256
const RADIUS = 52 // promien zaokraglenia tla dla kafelkow
const GLYPH = { x0: 60, y0: 58, x1: 182, y1: 206 } // bbox nuty w przestrzeni 256

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ]
}

function inRoundedRect(x, y, w, h, r) {
  const cx = x < r ? r : x > w - r ? w - r : x
  const cy = y < r ? r : y > h - r ? h - r : y
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
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** Czy punkt (w przestrzeni 256x256) nalezy do ksztaltu nuty. */
function isNote(x, y) {
  if (inEllipse(x, y, 96, 178, 36, 28)) return true // glowka
  if (inRect(x, y, 124, 58, 137, 182)) return true // laska
  if (inTriangle(x, y, 137, 58, 182, 96, 137, 122)) return true // choragiewka
  return false
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

export function encodePng(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // glebia bitowa
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc(height * (1 + stride))
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0 // filtr None
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * Renderuje logo do bufora PNG.
 * mode 'tile'   — kwadratowy kafelek: gradient na calej powierzchni, zaokraglone rogi, nuta jak w ikonie
 * mode 'banner' — szeroki kafelek / splash: prostokatny gradient, nuta wysrodkowana
 * mode 'plate'  — jak 'tile', ale bez zaokraglen (Windows sam przycina niektore kafelki)
 */
export function renderLogoPng({ width, height = width, mode = 'tile', glyphScale }) {
  const pixels = Buffer.alloc(width * height * 4)

  // Mapowanie przestrzeni 256x256 (glyph) na plotno.
  let scale, offX, offY
  if (mode === 'banner') {
    // nuta zajmuje `glyphScale` wysokosci plotna, wysrodkowana wg swojego bbox
    const target = height * (glyphScale ?? 0.52)
    scale = target / (GLYPH.y1 - GLYPH.y0)
    offX = width / 2 - ((GLYPH.x0 + GLYPH.x1) / 2) * scale
    offY = height / 2 - ((GLYPH.y0 + GLYPH.y1) / 2) * scale
  } else {
    scale = width / BOX
    offX = 0
    offY = 0
  }
  const radius = mode === 'tile' ? RADIUS * (width / BOX) : 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (radius > 0 && !inRoundedRect(px, py, width, height, radius)) continue

          // wspolrzedne w przestrzeni glifu
          const gx = (px - offX) / scale
          const gy = (py - offY) / scale
          const col = isNote(gx, gy)
            ? WHITE
            : lerp(C1, C2, (px / width + py / height) / 2)
          r += col[0]
          g += col[1]
          b += col[2]
          a += 255
        }
      }
      const n = SS * SS
      const i = (y * width + x) * 4
      pixels[i] = Math.round(r / n)
      pixels[i + 1] = Math.round(g / n)
      pixels[i + 2] = Math.round(b / n)
      pixels[i + 3] = Math.round(a / n)
    }
  }
  return encodePng(pixels, width, height)
}
