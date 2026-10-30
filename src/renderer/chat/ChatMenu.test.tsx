// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keysOf } from '../shortcuts'
import { ChatMenu } from './ChatMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function open(remote?: Parameters<typeof ChatMenu>[0]['remote'], onSearch = vi.fn()) {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<ChatMenu agentId="a1" remote={remote} markdown={() => '# hi'} onSearch={onSearch} />))
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Conversation tools"]')!.click())
  const menu = host.querySelector('[role="menu"]')!
  const row = (name: string) => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((r) => r.textContent!.startsWith(name))!
  return { host, menu, row, onSearch }
}

describe('the conversation menu', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('groups its rows under Conversation, Look of the app and Remote', async () => {
    const { menu } = await open({ state: 'off' })
    expect([...menu.querySelectorAll('.menu-label')].map((h) => h.textContent)).toEqual(['Conversation', 'Look of the app', 'Remote'])
  })

  it('has no Remote group for a program that cannot be continued from a phone', async () => {
    const { menu } = await open(undefined)
    expect([...menu.querySelectorAll('.menu-label')].map((h) => h.textContent)).toEqual(['Conversation', 'Look of the app'])
    expect(menu.textContent).not.toContain('Remote control')
  })

  it('shows the key beside Search, and says what Save notes does', async () => {
    const { row } = await open()
    expect(row('Search').querySelector('kbd')!.textContent).toBe(keysOf('chat-find'))
    expect(row('Save notes').textContent).toContain('A short record, to the notes folder')
    expect(row('Copy as Markdown')).toBeDefined()
  })

  it('says why a look cannot be brought back, when none was changed', async () => {
    const { row } = await open()
    expect(row('Restore system look').textContent).toContain('Nothing changed by an agent yet')
    expect(row('Restore system look').hasAttribute('disabled')).toBe(true)
    expect(row('Previous look').textContent).toContain('No earlier look kept')
    expect(row('Previous look').hasAttribute('disabled')).toBe(true)
  })

  it('keeps Remote control as a row with its state', async () => {
    const { row } = await open({ state: 'off' })
    expect(row('Remote control').textContent).toContain('Off')
  })

  it('searches and closes the menu with a click on Search', async () => {
    const { host, row, onSearch } = await open()
    await act(async () => row('Search').click())
    expect(onSearch).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })
})
