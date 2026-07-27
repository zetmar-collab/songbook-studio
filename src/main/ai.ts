import { getSetting } from './db'

export interface ChordRequest {
  title: string
  artist: string
  key: string
  lyrics: string
  language: 'pl' | 'en'
}

/**
 * Generuje akordy dla podanego tekstu piosenki.
 * Obsługuje dwóch dostawców: OpenRouter oraz Google Gemini.
 * Wybór dostawcy i klucze pobierane są z ustawień (tabela settings).
 */
export async function generateChords(req: ChordRequest): Promise<string> {
  const provider = getSetting('ai_provider') || 'openrouter'
  const prompt = buildPrompt(req)

  if (provider === 'gemini') {
    return callGemini(prompt)
  }
  return callOpenRouter(prompt)
}

function buildPrompt(req: ChordRequest): string {
  const langNote =
    req.language === 'pl'
      ? 'Odpowiadaj wyłącznie w języku polskim (poza symbolami akordów).'
      : 'Respond only in English (apart from chord symbols).'

  return [
    'You are an expert musician and arranger.',
    'Given the song lyrics below, produce a chord chart.',
    'Rules:',
    '- Place chord symbols in square brackets inline, immediately before the syllable where the chord changes, e.g. "[C]Hello [G]world".',
    '- Keep the original lyric lines and their order.',
    '- Use standard chord notation (C, Am, G7, Dm, F#m, etc.).',
    '- If a key is provided, stay diatonic to that key where sensible.',
    '- Do not add explanations, only return the annotated lyrics.',
    langNote,
    '',
    `Title: ${req.title || '(unknown)'}`,
    `Artist: ${req.artist || '(unknown)'}`,
    `Key: ${req.key || '(not specified)'}`,
    '',
    'Lyrics:',
    req.lyrics
  ].join('\n')
}

async function callOpenRouter(prompt: string): Promise<string> {
  const apiKey = getSetting('openrouter_api_key') || process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) {
    throw new Error('Brak klucza API OpenRouter. Uzupełnij go w Ustawieniach.')
  }
  const model = getSetting('openrouter_model') || 'google/gemini-2.0-flash-exp:free'

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://songbook.studio',
      'X-Title': 'Songbook Studio'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter błąd ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenRouter zwrócił pustą odpowiedź.')
  return content
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = getSetting('gemini_api_key') || process.env.GEMINI_API_KEY || ''
  if (!apiKey) {
    throw new Error('Brak klucza API Gemini. Uzupełnij go w Ustawieniach.')
  }
  const model = getSetting('gemini_model') || 'gemini-2.0-flash'

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 }
      })
    }
  )

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini błąd ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!content) throw new Error('Gemini zwrócił pustą odpowiedź.')
  return content
}

export interface OpenRouterModel {
  id: string
  name: string
  context: number // maksymalna długość kontekstu (tokeny)
  maxOutput: number // maksymalna liczba tokenów odpowiedzi (0 = brak danych)
}

/**
 * Pobiera listę DARMOWYCH modeli z OpenRouter (cena promptu i odpowiedzi = 0).
 * Endpoint /models jest publiczny; klucz przekazujemy, jeśli jest dostępny.
 */
export async function fetchOpenRouterFreeModels(apiKey?: string): Promise<OpenRouterModel[]> {
  const key = apiKey || getSetting('openrouter_api_key') || process.env.OPENROUTER_API_KEY || ''
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: key ? { Authorization: `Bearer ${key}` } : {}
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter błąd ${res.status}: ${text.slice(0, 200)}`)
  }
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
      const textOut = !outs || outs.includes('text') // pomiń modele audio/obraz
      return free && textOut
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
