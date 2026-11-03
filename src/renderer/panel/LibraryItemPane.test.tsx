// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../shared/library'

vi.mock('../chat/markdown', () => ({ Markdown: ({ text }: { text: string }) => <div>{text}</div> }))

import { LibraryItemPane } from './LibraryItemPane'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const item: LibraryItem = { id: 'pdf', kind: 'skill', name: 'pdf', description: 'Work with PDFs.', body: 'Use it.', source: 'new', files: ['split.sh'], dir: '/lib/skills/pdf', tokens: { description: 4, body: 2 } }

describe('the tabs of an item', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('move with the arrow keys, Home and End, and each names the panel it shows', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<LibraryItemPane item={item} where={<div>where</div>} onEdit={() => undefined} onRemove={() => undefined} />))
    const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    const selected = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')!.textContent
    const key = (k: string) => act(async () => void document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })))
    tabs()[0]!.focus()
    expect(selected()).toBe('Overview')
    await key('ArrowRight')
    expect(selected()).toBe('What an agent reads')
    expect(document.activeElement?.textContent).toBe('What an agent reads')
    await key('End')
    expect(selected()).toBe('Files (1)')
    await key('ArrowRight')
    expect(selected()).toBe('Overview')
    await key('ArrowLeft')
    expect(selected()).toBe('Files (1)')
    await key('Home')
    expect(selected()).toBe('Overview')
    const panel = host.querySelector(`#${tabs()[0]!.getAttribute('aria-controls')}`)
    expect(panel?.getAttribute('role')).toBe('tabpanel')
    // Only the picked tab is in the Tab order.
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1])
  })
})
