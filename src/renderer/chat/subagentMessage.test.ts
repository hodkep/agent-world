import { describe, expect, it } from 'vitest'
import type { SubagentInfo } from '../../shared/chat'
import { findSubagent, reactTo, resumedUnseen, sendMessageCard } from './subagentMessage'

const T0 = 1_000_000
const info = (o: Partial<SubagentInfo> = {}): SubagentInfo => ({ agentId: 'af7fd77650e06ccb2', toolUseId: 'tu', type: 'fork', description: 'Show delivery photos to vendor and TB officers', startedAt: T0, updatedAt: T0 + 5000, done: false, calls: [], result: '', depth: 1, background: true, spawns: [], stopped: false, ...o })
const infos = [info(), info({ agentId: 'b1c2d3e4f5a6b7c8d', description: 'Other', type: 'Explore' })]
const RESUMED = JSON.stringify({ success: true, message: 'Resuming agent af7fd77', resumedAgentId: 'af7fd77650e06ccb2', pin: { id: 'af7fd77650e06ccb2' } })

describe('finding the subagent a message is for', () => {
  it('matches the full id, and the short form Claude prints in its replies', () => {
    expect(findSubagent(infos, 'af7fd77650e06ccb2')?.description).toContain('delivery photos')
    expect(findSubagent(infos, 'af7fd77')?.agentId).toBe('af7fd77650e06ccb2')
  })
  it('an exact id always matches, however short', () => {
    expect(findSubagent([info({ agentId: 'fake1' })], 'fake1')?.agentId).toBe('fake1')
  })
  it('does not match a name, a too-short start, or nothing', () => {
    expect(findSubagent(infos, 'linus')).toBeNull()
    expect(findSubagent(infos, 'af7')).toBeNull()
    expect(findSubagent(infos, '')).toBeNull()
  })
})

describe('the card for a SendMessage call', () => {
  const input = { to: 'af7fd77650e06ccb2', summary: 'Fix badly formatted order detail dialog', message: 'The user looked at the dialog.\n\nWhat to look at: the header.' }
  it('names the subagent by its task, titles the card with the summary and says it woke it up', () => {
    expect(sendMessageCard(input, { text: RESUMED, isError: false }, infos)).toMatchObject({
      label: 'To subagent',
      name: 'fork · Show delivery photos to vendor and TB officers',
      summary: 'Fix badly formatted order detail dialog',
      body: 'The user looked at the dialog.\n\nWhat to look at: the header.',
      tag: 'Woke it up',
      tone: 'go',
      route: 'af7fd77 · it had finished and is working again'
    })
  })
  it('says delivered when the subagent was still working (no resume in the answer)', () => {
    const c = sendMessageCard(input, { text: JSON.stringify({ success: true, message: 'Message queued' }), isError: false }, infos)
    expect(c).toMatchObject({ tag: 'Delivered', tone: 'ok', route: 'af7fd77 · it reads it at its next step' })
  })
  it('says not delivered, with what the tool said, when it failed', () => {
    expect(sendMessageCard(input, { text: 'No agent with that id in this session', isError: true }, infos)).toMatchObject({ tag: 'Not delivered', tone: 'bad', route: 'No agent with that id in this session' })
    expect(sendMessageCard(input, { text: JSON.stringify({ success: false, error: 'gone' }), isError: false }, infos)).toMatchObject({ tag: 'Not delivered', route: 'gone' })
  })
  it('says sending while the call has no answer yet', () => {
    expect(sendMessageCard(input, undefined, infos)).toMatchObject({ tag: 'Sending…', tone: 'wait' })
  })
  it('a message to a named agent reads "To agent", and an unknown id still reads as a subagent by its short id', () => {
    expect(sendMessageCard({ to: 'linus', message: 'hi' }, { text: JSON.stringify({ success: true }), isError: false }, infos)).toMatchObject({ label: 'To agent', name: 'linus', summary: '', tag: 'Delivered' })
    expect(sendMessageCard({ to: 'a0b1c2d3e4f5a6b7c', message: 'hi' }, undefined, [])).toMatchObject({ label: 'To subagent', name: 'a0b1c2d' })
  })
  it('copes with an input that is not shaped as expected', () => {
    expect(sendMessageCard({}, undefined, infos)).toMatchObject({ label: 'To agent', body: '', summary: '' })
  })
})

describe('what the office does when a message goes to a subagent', () => {
  it('flies the envelope to one that is in the office', () => {
    expect(reactTo('af7fd77650e06ccb2', ['af7fd77650e06ccb2'], infos)).toEqual({ kind: 'present', id: 'af7fd77650e06ccb2' })
    expect(reactTo('af7fd77', ['af7fd77650e06ccb2'], infos)).toEqual({ kind: 'present', id: 'af7fd77650e06ccb2' })
  })
  it('brings back one that is known but has left, with the kind of subagent it is', () => {
    expect(reactTo('af7fd77650e06ccb2', [], infos)).toEqual({ kind: 'wake', id: 'af7fd77650e06ccb2', type: 'fork' })
  })
  it('does nothing for a name or for a subagent nobody knows', () => {
    expect(reactTo('linus', [], infos)).toEqual({ kind: 'none' })
    expect(reactTo('ffffffffffffffff0', [], infos)).toEqual({ kind: 'none' })
  })
})

describe('a subagent that went on working after it left', () => {
  const stopped = (id: string, at: number) => new Map([[id, at]])
  it('is brought back when its own file shows new work after the time it was sent away', () => {
    const working = info({ updatedAt: T0 + 20_000 })
    expect(resumedUnseen([working], [], stopped(working.agentId, T0 + 5000), T0 + 21_000).map((i) => i.agentId)).toEqual([working.agentId])
  })
  it('is not brought back for the last line it wrote just before it stopped, or while the office still shows it', () => {
    const justStopped = info({ updatedAt: T0 + 5500 })
    expect(resumedUnseen([justStopped], [], stopped(justStopped.agentId, T0 + 5000), T0 + 6000)).toEqual([])
    const working = info({ updatedAt: T0 + 20_000 })
    expect(resumedUnseen([working], [working.agentId], stopped(working.agentId, T0 + 5000), T0 + 21_000)).toEqual([])
  })
  it('is not brought back when it is over again, or was never sent away', () => {
    const over = info({ updatedAt: T0 + 20_000, done: true })
    expect(resumedUnseen([over], [], stopped(over.agentId, T0 + 5000), T0 + 21_000)).toEqual([])
    expect(resumedUnseen([info({ updatedAt: T0 + 20_000 })], [], new Map(), T0 + 21_000)).toEqual([])
  })
})
