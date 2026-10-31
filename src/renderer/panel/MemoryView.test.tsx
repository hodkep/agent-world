// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryView } from './MemoryView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const now = Date.now()
let notes: { id: string; text: string; by: string; at: number }[]
const memoryList = vi.fn(async () => notes)
const memoryAdd = vi.fn(async (_a: string, text: string) => (notes = [{ id: 'n9', text, by: 'you', at: Date.now() }, ...notes], notes[0]!))
const memoryForget = vi.fn(async (_a: string, id: string) => void (notes = notes.filter((n) => n.id !== id)))
const listTools = vi.fn()

async function mount() {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<MemoryView agentId="a1" />))
  await act(async () => void (await Promise.resolve()))
  return host
}
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())
const button = (host: HTMLElement, name: string | RegExp) => [...host.querySelectorAll('button, label')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')))

describe('the Agent Memory page', () => {
  beforeEach(() => {
    notes = [
      { id: 'n1', text: 'Use pnpm test', by: 'delta', at: now },
      { id: 'n2', text: 'Done todo#1 "x" by os. Closed when its turn ended', by: 'os', at: now - 1000 },
      { id: 'n3', text: 'Never edit CHANGELOG.md', by: 'cocain', at: now - 86400000 }
    ]
    ;(window as unknown as { aw: unknown }).aw = { memoryList, memoryAdd, memoryForget, listTools }
    vi.clearAllMocks()
  })
  afterEach(() => void (document.body.innerHTML = ''))

  it('shows only the notes, under day headings, and no MCP servers or plugins', async () => {
    const host = await mount()
    expect(host.textContent).toContain('Agent Memory')
    expect(host.textContent).toContain('Use pnpm test')
    expect(host.textContent).toContain('Today')
    expect(host.textContent).toContain('Yesterday')
    expect(host.textContent).not.toMatch(/MCP|Plugins|Add server/)
    expect(listTools).not.toHaveBeenCalled()
  })

  it('filters by who wrote the note', async () => {
    const host = await mount()
    await click(button(host, 'cocain'))
    expect(host.textContent).toContain('Never edit CHANGELOG.md')
    expect(host.textContent).not.toContain('Use pnpm test')
    await click(button(host, 'All'))
    expect(host.textContent).toContain('Use pnpm test')
  })

  it('can hide the finished-task log lines', async () => {
    const host = await mount()
    expect(host.textContent).toContain('Done todo#1')
    await click(host.querySelector('input[type=checkbox]'))
    expect(host.textContent).not.toContain('Done todo#1')
    expect(host.textContent).toContain('Use pnpm test')
  })

  it('saves a new note and forgets one', async () => {
    const host = await mount()
    const input = host.querySelector('input[aria-label="Add a note"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ship on Fridays')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(button(host, 'Save'))
    expect(memoryAdd).toHaveBeenCalledWith('a1', 'Ship on Fridays')
    expect(host.textContent).toContain('Ship on Fridays')
    await click(host.querySelector('button[aria-label^="Forget: Use pnpm"]'))
    expect(memoryForget).toHaveBeenCalledWith('a1', 'n1')
    expect(host.textContent).not.toContain('Use pnpm test')
  })
})
