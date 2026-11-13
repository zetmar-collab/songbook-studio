// Minimalny czytnik/zapis ZIP bez zależności (deflate + store, bez ZIP64 i szyfrowania).
// Używany do pełnych kopii zapasowych (baza + nagrania) i do odczytu plików .docx.
import { deflateRawSync, inflateRawSync } from 'zlib'

export interface ZipEntry {
  name: string
  data: Buffer
}

export interface ZipLimits {
  maxEntries?: number
  /** Maksymalny rozmiar pojedynczego wpisu po rozpakowaniu. */
  maxEntryBytes?: number
  /** Maksymalna suma rozmiarów po rozpakowaniu (ochrona przed „bombą ZIP"). */
  maxTotalBytes?: number
}

const DEFAULT_LIMITS: Required<ZipLimits> = {
  maxEntries: 20000,
  maxEntryBytes: 1024 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024
}

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

export function writeZip(entries: ZipEntry[]): Buffer {
  if (entries.length > 0xfffe) throw new Error('Za dużo plików w archiwum ZIP.')
  const { time, date } = dosDateTime(new Date())
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const deflated = e.data.length > 64 ? deflateRawSync(e.data, { level: 6 }) : e.data
    const useDeflate = deflated !== e.data && deflated.length < e.data.length
    const body = useDeflate ? deflated : e.data
    const method = useDeflate ? 8 : 0
    if (body.length >= 0xffffffff || e.data.length >= 0xffffffff) {
      throw new Error('Plik jest za duży na archiwum ZIP (limit 4 GB).')
    }

    const local = Buffer.alloc(30)
    local.writeUInt32LE(SIG_LOCAL, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nazwy w UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(SIG_CENTRAL, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, body)
    centrals.push(central, name)
    offset += 30 + name.length + body.length
  }

  const centralBuf = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(SIG_EOCD, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, eocd])
}

interface CentralRecord {
  name: string
  method: number
  compSize: number
  size: number
  crc: number
  localOffset: number
}

function readCentralDirectory(buf: Buffer, maxEntries: number): CentralRecord[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('To nie jest poprawne archiwum ZIP.')

  const count = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  let ptr = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || ptr === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('Archiwa ZIP64 nie są obsługiwane.')
  }
  if (count > maxEntries) throw new Error('Archiwum zawiera zbyt wiele plików.')

  const out: CentralRecord[] = []
  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== SIG_CENTRAL) {
      throw new Error('Uszkodzony spis treści archiwum ZIP.')
    }
    const flags = buf.readUInt16LE(ptr + 8)
    if (flags & 1) throw new Error('Zaszyfrowane archiwa ZIP nie są obsługiwane.')
    const compSize = buf.readUInt32LE(ptr + 20)
    const size = buf.readUInt32LE(ptr + 24)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('Archiwa ZIP64 nie są obsługiwane.')
    }
    out.push({
      name: buf.toString('utf8', ptr + 46, ptr + 46 + nameLen),
      method: buf.readUInt16LE(ptr + 10),
      compSize,
      size,
      crc: buf.readUInt32LE(ptr + 16),
      localOffset
    })
    ptr += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function extract(buf: Buffer, rec: CentralRecord, maxEntryBytes: number): Buffer {
  if (rec.size > maxEntryBytes) throw new Error(`Plik „${rec.name}" w archiwum jest zbyt duży.`)
  const o = rec.localOffset
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== SIG_LOCAL) {
    throw new Error('Uszkodzony nagłówek pliku w archiwum ZIP.')
  }
  const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28)
  if (start + rec.compSize > buf.length) throw new Error('Archiwum ZIP jest ucięte.')
  const comp = buf.subarray(start, start + rec.compSize)

  let data: Buffer
  if (rec.method === 0) data = Buffer.from(comp)
  else if (rec.method === 8) {
    data = rec.size === 0 ? Buffer.alloc(0) : inflateRawSync(comp, { maxOutputLength: rec.size })
  } else throw new Error(`Nieobsługiwana metoda kompresji ZIP: ${rec.method}`)

  if (data.length !== rec.size || crc32(data) !== rec.crc) {
    throw new Error(`Plik „${rec.name}" w archiwum jest uszkodzony (zła suma kontrolna).`)
  }
  return data
}

/** Lista nazw wpisów (bez rozpakowywania). */
export function listZip(buf: Buffer, limits: ZipLimits = {}): string[] {
  const l = { ...DEFAULT_LIMITS, ...limits }
  return readCentralDirectory(buf, l.maxEntries).map((r) => r.name)
}

/** Pojedynczy wpis albo null, gdy go nie ma. */
export function readZipEntry(buf: Buffer, name: string, limits: ZipLimits = {}): Buffer | null {
  const l = { ...DEFAULT_LIMITS, ...limits }
  const rec = readCentralDirectory(buf, l.maxEntries).find((r) => r.name === name)
  return rec ? extract(buf, rec, l.maxEntryBytes) : null
}

/** Wszystkie wpisy (z weryfikacją sum kontrolnych i limitami rozmiaru). */
export function readZip(buf: Buffer, limits: ZipLimits = {}): ZipEntry[] {
  const l = { ...DEFAULT_LIMITS, ...limits }
  const records = readCentralDirectory(buf, l.maxEntries)
  const total = records.reduce((s, r) => s + r.size, 0)
  if (total > l.maxTotalBytes) throw new Error('Archiwum po rozpakowaniu byłoby zbyt duże.')
  return records
    .filter((r) => !r.name.endsWith('/'))
    .map((r) => ({ name: r.name, data: extract(buf, r, l.maxEntryBytes) }))
}
