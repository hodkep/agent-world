// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteAsk } from './SiteAsk'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
async function show(p: { host?: string; http?: boolean; by?: string }) {
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  const onOpen = vi.fn()
  const onOther = vi.fn()
  await act(async () => root!.render(<SiteAsk host={p.host ?? 'example.com'} http={p.http ?? false} by={p.by} onOpen={onOpen} onOther={onOther} />))
  return { host, onOpen, onOther, button: (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === t) }
}

describe('the question about a site on the internet', () => {
  afterEach(async () => {
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
  })

  it('is the question it always was for an address the person typed', async () => {
    const { host, button, onOpen, onOther } = await show({})
    expect(host.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Open this site here?')
    expect(host.textContent).toContain('example.com is on the internet')
    expect(host.textContent).not.toMatch(/waiting/)
    await act(async () => button('Open here')!.click())
    await act(async () => button('In my browser')!.click())
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOther).toHaveBeenCalledTimes(1)
  })

  it('names the agent that asked, says it waits, and offers Not now in place of the browser', async () => {
    const { host, button } = await show({ by: 'csr-1' })
    expect(host.textContent).toContain('csr-1 wants to open example.com')
    expect(host.textContent).toMatch(/csr-1 is waiting for you/)
    expect(button('Not now')).toBeTruthy()
    expect(button('In my browser')).toBeUndefined()
  })

  it('warns about a connection that is not encrypted', async () => {
    const { host } = await show({ http: true })
    expect(host.textContent).toContain('The connection is not encrypted.')
  })
})
