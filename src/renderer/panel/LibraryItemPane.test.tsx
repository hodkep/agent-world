// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../shared/library'

vi.mock('../chat/markdown', () => ({ Markdown: ({ text }: { text: string }) => <div>{text}</div> }))

import { LibraryItemPane } from './LibraryItemPane'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item: LibraryItem = { id: 'pdf', kind: 'skill', name: 'pdf', description: 'Work with PDFs.', body: 'Use it.', source: 'new', files: ['split.sh'], dir: '/lib/skills/pdf', tokens: { description: 4, body: 2 } }

describe('an open item, read as a page', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('opens on its details (where it works, its files) and moves to its own words with the arrow keys', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<LibraryItemPane item={item} where={<div>where it works</div>} onEdit={() => undefined} onRemove={() => undefined} />))
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const panel = () => host.querySelector(`#${tabs().find((t) => t.getAttribute('aria-selected') === 'true')!.getAttribute('aria-controls')}`)!
    expect(tabs().map((t) => t.textContent)).toEqual(['Details', 'Skill content'])
    expect(panel().getAttribute('role')).toBe('tabpanel')
    expect(panel().textContent).toContain('where it works')
    expect(panel().textContent).toContain('split.sh')
    expect(host.textContent).not.toContain('Use it.')
    tabs()[0]!.focus()
    await act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(document.activeElement?.textContent).toBe('Skill content')
    expect(panel().querySelector('[aria-label="The item\'s text, scrolls"]')?.textContent).toContain('Use it.')
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0])
  })

  it('calls the text tab Content for an instruction or a prompt', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<LibraryItemPane item={{ ...item, kind: 'instruction' }} onEdit={() => undefined} onRemove={() => undefined} />))
    expect([...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Details', 'Content'])
  })

  it('names where it came from above its name', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<LibraryItemPane item={{ ...item, source: 'mattpocock-skills 1.3.1' }} onEdit={() => undefined} onRemove={() => undefined} />))
    expect(host.querySelector('nav[aria-label="Where it is"]')?.textContent).toBe('Skills›mattpocock-skills 1.3.1›pdf')
  })
})
