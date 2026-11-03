import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fallbackSummary, lastSummary, listTalks, removeTalk, saveTalk, summarize, type Turn } from './memory'

const turns: Turn[] = [{ who: 'you', text: 'Let us add discount codes.' }, { who: 'it', text: 'Percent first?' }, { who: 'you', text: 'Yes, percent.' }]
const file = () => join(mkdtempSync(join(tmpdir(), 'aw-voice-mem-')), 'shop.json')

describe('remembering a talk', () => {
  it('summarises with Gemini and trims what comes back', async () => {
    let seen = ''
    const f = (async (_u: string, init?: RequestInit) => ((seen = String(init?.body)), new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '  - Chose percent discounts.\n- Next: draft for ada.  ' }] } }] })))) as unknown as typeof fetch
    expect(await summarize('AIzaKey', turns, f)).toBe('- Chose percent discounts.\n- Next: draft for ada.')
    expect(seen).toMatch(/discount codes/)
  })
  it('falls back to the last few turns when Gemini cannot be reached or says nothing', async () => {
    const down = (async () => { throw new Error('offline') }) as typeof fetch
    expect(await summarize('AIzaKey', turns, down)).toBe(fallbackSummary(turns))
    const empty = (async () => new Response(JSON.stringify({}))) as unknown as typeof fetch
    expect(await summarize('AIzaKey', turns, empty)).toBe(fallbackSummary(turns))
  })
  it('has nothing to say about a talk with no words', async () => {
    expect(fallbackSummary([])).toBe('')
    const never = (async () => { throw new Error('called') }) as typeof fetch
    expect(await summarize('AIzaKey', [], never)).toBe('')
  })
  it('keeps the fallback short', () => {
    const long: Turn[] = Array.from({ length: 40 }, (_, i) => ({ who: i % 2 ? 'it' : 'you', text: 'word '.repeat(60) }))
    expect(fallbackSummary(long).length).toBeLessThanOrEqual(900)
  })
  it('saves talks for a workspace, newest first, and gives the last summary to the next talk', () => {
    const f = file()
    saveTalk(f, { at: 1, summary: 'first', turns: 3 })
    saveTalk(f, { at: 2, summary: 'second', turns: 5 })
    expect(listTalks(f).map((t) => t.summary)).toEqual(['second', 'first'])
    expect(lastSummary(f)).toBe('second')
  })
  it('lets the person delete one, and has no summary when none are left', () => {
    const f = file()
    saveTalk(f, { at: 1, summary: 'first', turns: 3 })
    removeTalk(f, 1)
    expect([listTalks(f), lastSummary(f)]).toEqual([[], ''])
  })
  it('keeps only the latest twenty, and does not save an empty talk', () => {
    const f = file()
    for (let i = 1; i <= 25; i++) saveTalk(f, { at: i, summary: `s${i}`, turns: 2 })
    saveTalk(f, { at: 99, summary: '', turns: 0 })
    expect(listTalks(f)).toHaveLength(20)
    expect(listTalks(f)[0]!.summary).toBe('s25')
  })
  it('starts clean from a file that is not what it expects', () => {
    expect(lastSummary(join(mkdtempSync(join(tmpdir(), 'aw-voice-mem-')), 'none.json'))).toBe('')
  })
})
