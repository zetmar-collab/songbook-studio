// SQLite zapisuje datetime('now') w UTC jako „RRRR-MM-DD GG:MM:SS" (bez strefy) —
// bez dopisania „Z" przeglądarka uznałaby je za czas lokalny i pokazała przesunięte godziny.
export function parseDbDate(s: string): Date {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z')
}

export function formatDbDate(s: string): string {
  const d = parseDbDate(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export function errorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  // Electron dokleja do błędów IPC prefiks „Error invoking remote method '…': Error: "
  return raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}
