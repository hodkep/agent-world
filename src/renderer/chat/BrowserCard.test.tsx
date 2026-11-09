// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from './format'
import type { BrowserGroup } from './browserGroup'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// A module down the import chain asks the window about its colour scheme as it loads; jsdom has no such question.
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
const { BrowserCard } = await import('./BrowserCard')

const T = 'npx -y agent-browser@0.41.2'
type Call = Extract<Row, { kind: 'tool' }>
const call = (id: string, command: string, o: { text?: string; isError?: boolean; sec?: number; done?: boolean } = {}): Call => ({ kind: 'tool', id, run: { name: 'Bash', input: { command }, ...(o.done !== false && { result: { text: o.text ?? '', isError: !!o.isError } }), ...(o.sec && { sec: o.sec }) } })
const SNAP = '- textbox "Username" [ref=e9]\n- textbox "Password" [ref=e10]\n- button "Sign in" [ref=e8]'

let root: Root | null = null
async function show(calls: Call[], working = false, refs?: Record<string, string>) {
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  const group: BrowserGroup = { kind: 'browser', id: calls[0]!.id, calls, refs: refs ?? {} }
  const onOpen = vi.fn()
  await act(async () => root!.render(<BrowserCard group={group} agentId="a1" agentName="alpha" working={working} onOpenPreview={onOpen} onImage={() => {}} />))
  return { host, onOpen }
}
const lines = (h: HTMLElement) => [...h.querySelectorAll('.bc-step')].map((e) => e.textContent!.replace(/\s+/g, ' ').trim())

describe('the card for a run of browser commands', () => {
  const aw = { fileImage: vi.fn(async (_a: string, _p: string): Promise<{ info: { inside: boolean }; src: string }> => { throw new Error('no') }) }
  beforeEach(() => void (vi.clearAllMocks(), ((window as unknown as { aw: unknown }).aw = aw)))
  afterEach(async () => {
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
  })

  it('says each step in words, naming the controls from the page it read', async () => {
    const { host } = await show([
      call('a', `${T} open http://localhost:5391/login && ${T} snapshot -i`, { text: SNAP, sec: 2 }),
      call('b', `${T} fill @e9 demo`),
      call('c', `${T} fill @e10 hunter2`),
      call('d', `${T} click @e8`, { sec: 1 })
    ])
    const l = lines(host)
    expect(l[0]).toMatch(/Opened localhost:5391\/login/)
    expect(l[1]).toMatch(/Read the page · 3 controls/)
    expect(l[2]).toMatch(/Typed “demo” in Username/)
    expect(l[3]).toMatch(/Typed •{6} in Password/)
    expect(l.join(' ')).not.toContain('hunter2')
    expect(l[4]).toMatch(/Clicked “Sign in”/)
  })

  it('names the agent, the site and how many steps, and offers the Preview', async () => {
    const { host, onOpen } = await show([call('a', `${T} open http://localhost:5391`), call('b', `${T} snapshot`)])
    expect(host.querySelector('.bc-head')!.textContent).toContain('Browsed localhost:5391')
    expect(host.querySelector('.bc-head')!.textContent).toMatch(/alpha · 2 steps/)
    const open = [...host.querySelectorAll('button')].find((b) => /Open Preview/.test(b.textContent ?? ''))!
    await act(async () => open.click())
    expect(onOpen).toHaveBeenCalledWith('a1')
  })

  it('while it works, says so and marks the last step as the one in progress', async () => {
    const { host } = await show([call('a', `${T} open http://localhost:5391`), call('b', `${T} click @e8`, { done: false })], true)
    expect(host.querySelector('.bc-head')!.textContent).toContain('Browsing localhost:5391')
    expect(host.querySelector('.bc-head')!.textContent).toMatch(/working/)
    const steps = host.querySelectorAll('.bc-step')
    expect(steps[steps.length - 1]!.classList.contains('now')).toBe(true)
    expect(steps[0]!.classList.contains('ok')).toBe(true)
  })

  it('shows a command that failed as a failed step, with the reason', async () => {
    const { host } = await show([call('a', `${T} open https://example.com`, { isError: true, text: '✗ CDP error (Page.navigate): The person said not now: example.com is not allowed in the Preview' })])
    const step = host.querySelector('.bc-step.bad')!
    expect(step.textContent).toContain('Opened example.com')
    expect(step.textContent).toContain('The person said not now')
    expect(host.querySelector('.bc-head')!.textContent).toMatch(/1 failed/)
  })

  it('shows every step of a command that was not allowed as not done, since nothing in it ran', async () => {
    const { host } = await show([call('a', `${T} open https://www.google.com/search?q=x && ${T} get text body | head -150`, { isError: true, text: 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: The server-side auto mode classifier judged this action dangerous (it gave no explanation).' })])
    const steps = [...host.querySelectorAll('.bc-step')]
    expect(steps).toHaveLength(2)
    expect(steps.every((s) => s.classList.contains('bad'))).toBe(true)
    expect(host.querySelector('.bc-head')!.textContent).toMatch(/not allowed|blocked/i)
    expect(host.textContent).toContain('Claude Code did not allow this command')
  })

  it('keeps a failure that is not a denial as the last step only, since the steps before it ran', async () => {
    const { host } = await show([call('a', `${T} open http://localhost:5391 && ${T} click @e99`, { isError: true, text: '✗ Unknown ref: e99' })])
    const steps = [...host.querySelectorAll('.bc-step')]
    expect(steps[0]!.classList.contains('ok')).toBe(true)
    expect(steps[1]!.classList.contains('bad')).toBe(true)
  })

  it('keeps the commands themselves one click away', async () => {
    const { host } = await show([call('a', `${T} open http://localhost:5391`, { text: 'ok' })])
    expect(host.textContent).not.toContain('npx -y agent-browser')
    const fold = [...host.querySelectorAll('button')].find((b) => /Show the 1 command/.test(b.textContent ?? ''))!
    await act(async () => fold.click())
    expect(host.textContent).toContain('agent-browser')
  })

  it('says what size the page was resized to', async () => {
    const { host } = await show([call('a', `${T} set viewport 390 844`)])
    expect(lines(host)[0]).toMatch(/Resized to 390 × 844 · phone/)
  })

  it('names the controls from the cards before it, when a message ended the card that read the page', async () => {
    const { host } = await show([call('a', `${T} fill @e9 demo`), call('b', `${T} click @e8`)], false, { e9: 'Username', e8: 'Sign in' })
    const l = lines(host)
    expect(l[0]).toMatch(/Typed “demo” in Username/)
    expect(l[1]).toMatch(/Clicked “Sign in”/)
  })

  it('puts a space between a step and the screenshot file it names', async () => {
    const { host } = await show([call('a', `${T} screenshot phone.png`)])
    expect(lines(host)[0]).toMatch(/Took a screenshot phone\.png/)
  })

  it('shows the screenshot as a picture, read from the agent’s own folder by the name the command gave', async () => {
    aw.fileImage.mockResolvedValueOnce({ info: { inside: true }, src: 'data:image/png;base64,AAAA' })
    const { host } = await show([call('a', `${T} screenshot phone.png`)])
    await act(async () => void (await Promise.resolve()))
    await act(async () => void (await Promise.resolve()))
    expect(aw.fileImage).toHaveBeenCalledWith('a1', 'phone.png')
    expect(host.querySelector('.bc-shot img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('shows a picture only from the agent’s own folder: a file named from anywhere else stays a name', async () => {
    aw.fileImage.mockResolvedValueOnce({ info: { inside: false }, src: 'data:image/png;base64,BBBB' })
    const { host } = await show([call('a', `${T} screenshot ~/Pictures/private.png`)])
    await act(async () => void (await Promise.resolve()))
    await act(async () => void (await Promise.resolve()))
    expect(host.querySelector('.bc-shot')).toBeNull()
    expect(host.querySelector('.bc-file')!.textContent).toBe('private.png')
  })

  it('keeps the file’s name when the picture cannot be read', async () => {
    const { host } = await show([call('a', `${T} screenshot gone.png`)])
    await act(async () => void (await Promise.resolve()))
    expect(host.querySelector('.bc-shot')).toBeNull()
    expect(host.querySelector('.bc-file')!.textContent).toBe('gone.png')
  })
})
