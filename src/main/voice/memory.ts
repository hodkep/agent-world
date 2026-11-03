import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Turn { who: 'you' | 'it'; text: string }
export interface Talk { at: number; summary: string; turns: number }

const KEEP = 20
export const SUMMARY_MODEL = 'gemini-2.5-flash'
const asText = (t: Turn[]) => t.map((x) => `${x.who === 'you' ? 'Person' : 'Voice'}: ${x.text}`).join('\n')

/** The last few turns, shortened: what is kept when Gemini cannot be asked for a summary. */
export function fallbackSummary(turns: Turn[]): string {
  const text = asText(turns.slice(-6).map((t) => ({ ...t, text: t.text.slice(0, 140) })))
  return text.slice(0, 900)
}

/** A few lines on what the talk settled, from a cheap Gemini text model; the fallback when it cannot answer. */
export async function summarize(key: string, turns: Turn[], fetchFn: typeof fetch = fetch): Promise<string> {
  if (!turns.length) return ''
  try {
    const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${SUMMARY_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Summarise this spoken conversation in at most five short lines: what was decided, what is open, what comes next. No preamble.\n\n${asText(turns).slice(-12_000)}` }] }] }),
      signal: AbortSignal.timeout(20_000)
    })
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text ? text.slice(0, 900) : fallbackSummary(turns)
  } catch {
    return fallbackSummary(turns)
  }
}

export function listTalks(file: string): Talk[] {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { talks?: unknown }
    return Array.isArray(raw.talks) ? raw.talks.filter((t): t is Talk => !!t && typeof (t as Talk).at === 'number' && typeof (t as Talk).summary === 'string').sort((a, b) => b.at - a.at) : []
  } catch {
    return []
  }
}
const write = (file: string, talks: Talk[]) => {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify({ talks }), { mode: 0o600 })
  renameSync(tmp, file)
}
/** Keeps a talk with something in it; the latest twenty stay. */
export function saveTalk(file: string, t: Talk) {
  if (!t.summary.trim()) return
  write(file, [t, ...listTalks(file)].slice(0, KEEP))
}
export const removeTalk = (file: string, at: number) => write(file, listTalks(file).filter((t) => t.at !== at))
/** What the next talk starts from. */
export const lastSummary = (file: string) => listTalks(file)[0]?.summary ?? ''
