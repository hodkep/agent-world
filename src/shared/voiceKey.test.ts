import { describe, expect, it } from 'vitest'
import { keyHint, micChip, modelLabel, startProblem, stepsFor } from './voiceKey'

describe('showing a saved key without giving it away', () => {
  it('keeps the first and last four characters', () => {
    expect(keyHint('AIzaSyD3x4mpleK7Qx')).toBe('AIza••••••••K7Qx')
  })
  it('shows nothing for something too short to be a key', () => {
    expect(keyHint('AIza')).toBe('')
  })
})

describe('describing a voice model in words', () => {
  const def = 'gemini-3.8-live'
  it('marks the default', () => {
    expect(modelLabel(def, def)).toMatchObject({ tag: 'default', note: expect.stringMatching(/start with/i) })
  })
  it('says what extended thinking costs', () => {
    expect(modelLabel('gemini-3.8-live-extended-thinking', def).note).toMatch(/slower, costs more/i)
  })
  it('warns that older and preview models can go', () => {
    expect(modelLabel('gemini-2.5-flash-native-audio-preview-12-2025', def).tag).toBe('older')
    expect(modelLabel('gemini-3.1-flash-live-preview', def).tag).toBe('preview')
  })
  it('has no note for a model it does not know', () => {
    expect(modelLabel('gemini-9-live', def)).toEqual({ note: '', tag: '' })
  })
})

describe('which check of the key failed', () => {
  it('none when Google listed the voice models', () => {
    expect(stepsFor({ ok: true, models: ['a', 'b'] })).toEqual({ failAt: -1, found: 2 })
  })
  it('the reaching step when Google could not be reached', () => {
    expect(stepsFor({ ok: false, reason: 'unreachable' }).failAt).toBe(0)
  })
  it('the key step when Google refused it', () => {
    expect(stepsFor({ ok: false, reason: 'invalid' }).failAt).toBe(1)
  })
  it('the models step when the key can use no voice model', () => {
    expect(stepsFor({ ok: false, reason: 'none' }).failAt).toBe(2)
  })
})

describe('the microphone chip', () => {
  it('says allowed, blocked or not asked yet', () => {
    expect(micChip('granted')).toEqual({ text: 'microphone allowed', tone: 'ok' })
    expect(micChip('denied')).toEqual({ text: 'microphone blocked in System Settings', tone: 'bad' })
    expect(micChip('restricted')).toEqual({ text: 'microphone blocked in System Settings', tone: 'bad' })
    expect(micChip('not-determined')).toEqual({ text: 'microphone not asked yet', tone: 'idle' })
  })
  it('does not claim a state it does not know', () => {
    expect(micChip('odd')).toEqual({ text: 'microphone state unknown', tone: 'idle' })
  })
})

describe('what to tell the person when a talk cannot start', () => {
  it('sends them to Settings when the key or the switch is the problem, and says why', () => {
    expect(startProblem('nokey')).toMatchObject({ settings: true, text: expect.stringMatching(/no gemini key/i) })
    expect(startProblem('off')).toMatchObject({ settings: true, text: expect.stringMatching(/switched off/i) })
    expect(startProblem('unreadable')).toMatchObject({ settings: true, text: expect.stringMatching(/keychain/i) })
  })
  it('says how to allow the microphone, without sending them to the voice settings', () => {
    expect(startProblem('mic')).toMatchObject({ settings: false, text: expect.stringMatching(/microphone is blocked.*System Settings/i) })
  })
  it('only says what to do when there is no project', () => {
    expect(startProblem('nofolder')).toEqual({ settings: false, text: 'Open a project first.' })
  })
  it('keeps what went wrong when it is none of those', () => {
    expect(startProblem('boom')).toEqual({ settings: false, text: 'The voice companion could not start: boom' })
  })
})
