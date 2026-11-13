import { getSetting } from './db'
import { buildPrompt, cleanAiOutput, type ChordRequest } from './aiText'

export type { ChordRequest }

const GENERATE_TIMEOUT_MS = 60_000
const MODELS_TIMEOUT_MS = 20_000
const APP_URL = 'https://zetmar-collab.github.io/songbook-studio/'

// Identyfikatory modeli trafiają do adresu URL — przepuszczamy tylko bezpieczne znaki.
const OPENROUTER_MODEL_RE = /^[\w.\-:/]{1,120}$/
const GEMINI_MODEL_RE = /^[\w.\-]{1,80}$/

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(`Dostawca AI nie odpowiedział w ciągu ${Math.round(ms / 1000)} s.`)
    }
    throw new Error('Brak połączenia z dostawcą AI. Sprawdź internet i spróbuj ponownie.')
  }
}

/**
 * Generuje akordy dla podanego tekstu piosenki (OpenRouter lub Google Gemini — wg ustawień).
 * Wynik jest czyszczony z otoczek Markdown.
 */
export async function generateChords(req: ChordRequest): Promise<string> {
  const provider = getSetting('ai_provider') || 'openrouter'
  const prompt = buildPrompt(req)
  const raw = provider === 'gemini' ? await callGemini(prompt) : await callOpenRouter(prompt)
  const cleaned = cleanAiOutput(raw)
  if (!cleaned) throw new Error('Dostawca AI zwrócił pustą odpowiedź.')
  return cleaned
}

async function failure(provider: string, res: Response): Promise<Error> {
  const text = await res.text().catch(() => '')
  return new Error(`${provider} błąd ${res.status}: ${text.slice(0, 300)}`)
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = getSetting('openrouter_api_key') || process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) throw new Error('Brak klucza API OpenRouter. Uzupełnij go w Ustawieniach.')
  const model = getSetting('openrouter_model') || 'google/gemini-2.0-flash-exp:free'
  if (!OPENROUTER_MODEL_RE.test(model)) throw new Error('Nieprawidłowy identyfikator modelu OpenRouter.')

  const res = await timedFetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': APP_URL,
        'X-Title': 'Songbook Studio'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4
      })
    },
    GENERATE_TIMEOUT_MS
  )
  if (!res.ok) throw await failure('OpenRouter', res)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = getSetting('gemini_api_key') || process.env.GEMINI_API_KEY || ''
  if (!apiKey) throw new Error('Brak klucza API Gemini. Uzupełnij go w Ustawieniach.')
  const model = getSetting('gemini_model') || 'gemini-2.0-flash'
  if (!GEMINI_MODEL_RE.test(model)) throw new Error('Nieprawidłowy identyfikator modelu Gemini.')

  // Klucz w nagłówku, a nie w adresie URL — adresy trafiają do logów i komunikatów błędów.
  const res = await timedFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    },
    GENERATE_TIMEOUT_MS
  )
  if (!res.ok) throw await failure('Gemini', res)
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export interface OpenRouterModel {
  id: string
  name: string
  context: number // maksymalna długość kontekstu (tokeny)
  maxOutput: number // maksymalna liczba tokenów odpowiedzi (0 = brak danych)
}

/**
 * Pobiera listę DARMOWYCH modeli z OpenRouter (cena promptu i odpowiedzi = 0).
 * Endpoint /models jest publiczny, więc klucz użytkownika nie jest tu wysyłany.
 */
export async function fetchOpenRouterFreeModels(): Promise<OpenRouterModel[]> {
  const res = await timedFetch('https://openrouter.ai/api/v1/models', {}, MODELS_TIMEOUT_MS)
  if (!res.ok) throw await failure('OpenRouter', res)
  const data = (await res.json()) as {
    data?: {
      id: string
      name?: string
      pricing?: { prompt?: string; completion?: string }
      architecture?: { output_modalities?: string[] }
      context_length?: number
      top_provider?: { max_completion_tokens?: number | null }
    }[]
  }
  const isZero = (v?: string): boolean => v !== undefined && Number(v) === 0

  return (data.data ?? [])
    .filter((m) => {
      const free = isZero(m.pricing?.prompt) && isZero(m.pricing?.completion)
      const outs = m.architecture?.output_modalities
      return free && (!outs || outs.includes('text')) // pomiń modele audio/obraz
    })
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context: m.context_length ?? 0,
      maxOutput: m.top_provider?.max_completion_tokens ?? 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Prosty test połączenia z wybranym dostawcą AI. */
export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await generateChords({
      title: 'Test',
      artist: '',
      key: 'C',
      lyrics: 'Hello world',
      language: 'en'
    })
    return { ok: true, message: result.slice(0, 120) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
