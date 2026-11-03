// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
// The pixel lettering draws on a canvas, which jsdom does not have.
vi.mock('../PixelWord', () => ({ PixelWord: ({ text }: { text: string }) => <span>{text}</span> }))
const { InputDialog } = await import('./InputDialog')

const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

describe('the question dialog', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('sends on Enter from the review page after an own answer was typed and entered', async () => {
    const answer = vi.fn(async () => {})
    const host = document.body.appendChild(document.createElement('div'))
    const need = { kind: 'question' as const, questions: [{ question: 'What now?', header: 'Q', multiSelect: false, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }] }] }
    await act(async () => createRoot(host).render(<InputDialog agentName="delta" need={need} more={0} onClose={() => {}} onFinishInTerminal={() => {}} actions={{ answer } as never} />))

    const input = host.querySelector('input[aria-label="Your own answer"]') as HTMLInputElement
    await act(async () => {
      input.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Explain it')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => void key(input, 'Enter'))
    expect(host.textContent).toContain('Check your answers')

    // Focus must still be inside the dialog, or the keys never reach it.
    await act(async () => void key(document.activeElement ?? document.body, 'Enter'))
    expect(answer).toHaveBeenCalledWith([{ picks: [], other: 'Explain it' }])
  })

  it('starts fresh when a shorter set of questions replaces the open one, and picking and sending do not throw', async () => {
    const answer = vi.fn(async () => {})
    const host = document.body.appendChild(document.createElement('div'))
    const q = (question: string, multiSelect = false) => ({ question, header: 'Q', multiSelect, options: [{ label: 'A', description: '' }, { label: 'B', description: '' }] })
    const root = createRoot(host)
    const draw = (questions: ReturnType<typeof q>[]) => act(async () => root.render(<InputDialog agentName="delta" need={{ kind: 'question' as const, questions }} more={0} onClose={() => {}} onFinishInTerminal={() => {}} actions={{ answer } as never} />))
    const pick = (label: string) => act(async () => void [...host.querySelectorAll<HTMLButtonElement>('button.choice')].find((b) => b.textContent?.includes(label))!.click())
    await draw([q('First?'), q('Second?', true)])
    await pick('A')
    // The agent asks again, with one question this time.
    await draw([q('Only this?')])
    expect(host.textContent).toContain('Only this?')
    await pick('B')
    expect(host.textContent).toContain('Check your answers')
    const send = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => /^Send/.test(b.textContent ?? ''))!
    await act(async () => void send.click())
    expect(answer).toHaveBeenCalledWith([{ picks: [1] }])
  })
})
