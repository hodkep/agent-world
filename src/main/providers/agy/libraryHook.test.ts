import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agyLibraryHook } from './libraryHook'

let home: string
let transcript: string
const user = (step: number, text: string) => JSON.stringify({ step_index: String(step), type: 'USER_INPUT', content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>` }) + '\n'
const payload = (conv = 'c1', over: Record<string, unknown> = {}) => ({ conversationId: conv, transcriptPath: transcript, ...over })
const io = (reply = 'LINE', hold: string | null = null) => {
  const asked: string[] = []
  const used: string[] = []
  const edits: string[] = []
  return { asked, used, edits, io: { remind: (p: string) => (asked.push(p), reply), used: (p: string) => used.push(p), editBlock: (f: string) => (edits.push(f), hold) } }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'agy-hook-'))
  process.env.AW_AGY_HOME = home
  mkdirSync(join(home, 'brain', 'c1', '.system_generated', 'logs'), { recursive: true })
  transcript = join(home, 'brain', 'c1', '.system_generated', 'logs', 'transcript_full.jsonl')
  writeFileSync(transcript, user(0, 'split this pdf'))
})
afterEach(() => {
  delete process.env.AW_AGY_HOME
  rmSync(home, { recursive: true, force: true })
})

describe("agy's hooks", () => {
  it('inject the library line before the first model call of a message, and only that one', () => {
    const t = io()
    expect(agyLibraryHook('pre-inv', payload(), t.io)).toEqual({ injectSteps: [{ ephemeralMessage: 'LINE' }] })
    expect(t.asked).toEqual(['split this pdf'])
    // a second model call in the same turn (after a tool) adds nothing
    expect(agyLibraryHook('pre-inv', payload(), t.io)).toEqual({})
    // the next message is asked about again
    appendFileSync(transcript, user(5, 'now the xlsx'))
    expect(agyLibraryHook('pre-inv', payload(), t.io)).toEqual({ injectSteps: [{ ephemeralMessage: 'LINE' }] })
    expect(t.asked).toEqual(['split this pdf', 'now the xlsx'])
  })
  it("ask about the user's words only, not the time and setting notes agy appends after them", () => {
    const notes = '\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: 2026-10-07T21:47:17+05:30.\n</ADDITIONAL_METADATA>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini.\n</USER_SETTINGS_CHANGE>'
    writeFileSync(transcript, JSON.stringify({ step_index: '0', type: 'USER_INPUT', content: `<USER_REQUEST>\nWhat is the capital of France?${notes}` }) + '\n')
    const t = io()
    agyLibraryHook('pre-inv', payload(), t.io)
    expect(t.asked).toEqual(['What is the capital of France?'])
  })
  it('add nothing when the app has nothing to say', () => {
    expect(agyLibraryHook('pre-inv', payload(), io('').io)).toEqual({})
  })
  it('keep each conversation apart', () => {
    mkdirSync(join(home, 'brain', 'c2', '.system_generated', 'logs'), { recursive: true })
    const t2 = join(home, 'brain', 'c2', '.system_generated', 'logs', 'transcript_full.jsonl')
    writeFileSync(t2, user(0, 'other'))
    const t = io()
    agyLibraryHook('pre-inv', payload(), t.io)
    expect(agyLibraryHook('pre-inv', { conversationId: 'c2', transcriptPath: t2 }, t.io)).toEqual({ injectSteps: [{ ephemeralMessage: 'LINE' }] })
  })
  it('read no file but agy\'s own transcripts', () => {
    const t = io()
    writeFileSync(join(home, 'secret.jsonl'), user(0, 'x'))
    expect(agyLibraryHook('pre-inv', payload('c3', { transcriptPath: join(home, 'secret.jsonl') }), t.io)).toEqual({})
    expect(agyLibraryHook('pre-inv', payload('c4', { transcriptPath: join(home, 'brain', 'c1', '.system_generated', 'logs', '..', '..', '..', '..', 'secret.jsonl') }), t.io)).toEqual({})
    expect(t.asked).toEqual([])
  })
  it('report a file read after a tool call, and nothing for other tools', () => {
    const t = io()
    expect(agyLibraryHook('post-tool', payload('c1', { toolCall: { name: 'view_file', args: { AbsolutePath: '/lib/skills/pdf/SKILL.md' } } }), t.io)).toEqual({})
    agyLibraryHook('post-tool', payload('c1', { toolCall: { name: 'run_command', args: { CommandLine: 'ls' } } }), t.io)
    expect(t.used).toEqual(['/lib/skills/pdf/SKILL.md'])
  })
  it('deny an edit the office holds back, with its words, for each of agy\'s three editing tools', () => {
    const t = io('LINE', 'Not yet: your plan is waiting for the person to approve it.')
    for (const name of ['write_to_file', 'replace_file_content', 'multi_replace_file_content']) {
      expect(agyLibraryHook('pre-tool', payload('c1', { toolCall: { name, args: { TargetFile: '/w/src/a.ts' } } }), t.io)).toEqual({ decision: 'deny', reason: 'Not yet: your plan is waiting for the person to approve it.' })
    }
    expect(t.edits).toEqual(['/w/src/a.ts', '/w/src/a.ts', '/w/src/a.ts'])
  })
  it('say nothing about an edit that is not held, a tool that does not edit, or a call with no file, so agy decides as it always did', () => {
    const open = io('LINE', null)
    expect(agyLibraryHook('pre-tool', payload('c1', { toolCall: { name: 'write_to_file', args: { TargetFile: '/w/src/a.ts' } } }), open.io)).toEqual({})
    const held = io('LINE', 'Not yet.')
    expect(agyLibraryHook('pre-tool', payload('c1', { toolCall: { name: 'run_command', args: { CommandLine: 'ls' } } }), held.io)).toEqual({})
    expect(agyLibraryHook('pre-tool', payload('c1', { toolCall: { name: 'write_to_file', args: {} } }), held.io)).toEqual({})
    expect(agyLibraryHook('pre-tool', payload('c1', {}), held.io)).toEqual({})
    expect(held.edits).toEqual([])
  })
  it('answer an event it does not know with an empty object', () => {
    expect(agyLibraryHook('stop', payload(), io().io)).toEqual({})
  })
  it('survive a missing or broken transcript', () => {
    expect(agyLibraryHook('pre-inv', payload('c1', { transcriptPath: undefined }), io().io)).toEqual({})
    writeFileSync(transcript, 'not json\n')
    expect(agyLibraryHook('pre-inv', payload(), io().io)).toEqual({})
  })
})
