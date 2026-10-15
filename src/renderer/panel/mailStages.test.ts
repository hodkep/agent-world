import { describe, expect, it } from 'vitest'
import { connectStages, nextPhase } from './mailStages'

describe('the stages of connecting a program to the message box', () => {
  it('walks writing, checking, ready with a bar that fills, and says what the Continue button waits for', () => {
    const w = connectStages('writing', 'agy')
    expect(w.steps.map((s) => `${s.state}:${s.label}`)).toEqual(['doing:Writing the entry', 'todo:Checking agy sees it', 'todo:Ready'])
    expect(w.percent).toBe(20)
    expect(w.waiting).toBe('Connecting agy…')
    const c = connectStages('checking', 'agy')
    expect(c.steps.map((s) => s.state)).toEqual(['done', 'doing', 'todo'])
    expect(c.percent).toBe(60)
    expect(c.waiting).toBe('Checking agy…')
    const r = connectStages('ready', 'agy')
    expect(r.steps.map((s) => s.state)).toEqual(['done', 'done', 'done'])
    expect(r.percent).toBe(100)
    expect(r.waiting).toBe('')
  })
  it('stops at the check when the program does not list the entry', () => {
    const f = connectStages('failed', 'agy')
    expect(f.steps.map((s) => s.state)).toEqual(['done', 'failed', 'todo'])
    expect(f.percent).toBe(60)
    expect(f.waiting).toBe('Connect agy to continue.')
  })
  it('judges the check from what the program lists once the re-scan is back, and gives a late answer a moment', () => {
    expect(nextPhase('checking', { scanned: false, mail: 'missing' })).toBe('checking')
    expect(nextPhase('checking', { scanned: true, mail: 'connected' })).toBe('ready')
    expect(nextPhase('checking', { scanned: true, mail: 'missing' })).toBe('checking')
    expect(nextPhase('checking', { scanned: true, mail: 'missing', lateMs: 1500 })).toBe('failed')
    expect(nextPhase('failed', { scanned: true, mail: 'connected' })).toBe('ready')
    expect(nextPhase('writing', { scanned: true, mail: 'connected' })).toBe('writing')
  })
})
