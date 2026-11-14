// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviewSites } from '../../shared/api'
import { SiteData } from './SiteData'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let data: PreviewSites
const previewSites = vi.fn(async (current?: string) => ({ current: current ? { host: current, cookies: data.current?.cookies ?? 0 } : null, others: [...data.others] }))
const clearPreviewSite = vi.fn(async (host: string) => void (data = { current: data.current && data.current.host === host ? { ...data.current, cookies: 0 } : data.current, others: data.others.filter((s) => s.host !== host) }))
const clearPreviewSites = vi.fn(async () => void (data = { current: data.current && { ...data.current, cookies: 0 }, others: [] }))

let root: Root | null = null
async function mount(page = 'https://github.com/hodkep/agent-world') {
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => root!.render(<SiteData page={page} />))
  await act(async () => void (await Promise.resolve()))
  return host
}
const click = (el: Element | null | undefined) => act(async () => void (el as HTMLElement).click())
const btn = (host: HTMLElement, name: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? '')))
const open = async (host: HTMLElement) => click(host.querySelector('button[aria-haspopup]'))

describe('the Site data button and menu in the Preview', () => {
  beforeEach(() => {
    data = { current: { host: 'github.com', cookies: 14 }, others: [{ host: 'accounts.google.com', cookies: 9 }, { host: 'vercel.com', cookies: 7 }] }
    Object.assign(window, { aw: { previewSites, clearPreviewSite, clearPreviewSites } })
    vi.clearAllMocks()
  })
  afterEach(async () => {
    await act(async () => root?.unmount())
    document.body.innerHTML = ''
  })

  it('asks about the page being shown, by its host and port, and marks the button when that page holds data', async () => {
    const host = await mount('http://localhost:5173/app')
    expect(previewSites).toHaveBeenCalledWith('localhost:5173')
    const b = host.querySelector('button[aria-haspopup]')!
    expect(b.getAttribute('aria-label')).toBe('Site data')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(b.classList.contains('has-data')).toBe(true)
  })

  it('looks again when the page has finished loading, since that is when its cookies arrive', async () => {
    data = { current: { host: 'x.dev', cookies: 0 }, others: [] }
    const host = await mount('https://x.dev/')
    expect(host.querySelector('button[aria-haspopup]')!.classList.contains('has-data')).toBe(false)
    data = { current: { host: 'x.dev', cookies: 2 }, others: [] }
    await act(async () => root!.render(<SiteData page="https://x.dev/" loading />))
    await act(async () => root!.render(<SiteData page="https://x.dev/" loading={false} />))
    await act(async () => void (await Promise.resolve()))
    expect(host.querySelector('button[aria-haspopup]')!.classList.contains('has-data')).toBe(true)
  })

  it('is not marked when the page holds nothing', async () => {
    data = { current: { host: 'x.dev', cookies: 0 }, others: [] }
    const host = await mount('https://x.dev/')
    expect(host.querySelector('button[aria-haspopup]')!.classList.contains('has-data')).toBe(false)
  })

  it('opens on this site, then the others, each with its own Clear', async () => {
    const host = await mount()
    await open(host)
    const menu = host.querySelector('[role="dialog"]')!
    expect(menu.textContent).toContain('github.com')
    expect(menu.textContent).toContain('14 cookies')
    expect(menu.textContent).toContain('accounts.google.com')
    expect(menu.textContent).toContain('vercel.com')
    expect([...menu.querySelectorAll('button')].filter((b) => b.textContent === 'Clear')).toHaveLength(3)
  })

  it('clears one site, shows it empty, and leaves the others', async () => {
    const host = await mount()
    await open(host)
    await click([...host.querySelectorAll('.sd-row')].find((r) => r.querySelector('span')?.textContent === 'vercel.com')!.querySelector('button'))
    expect(clearPreviewSite).toHaveBeenCalledWith('vercel.com')
    expect(host.textContent).not.toContain('vercel.com')
    expect(host.textContent).toContain('accounts.google.com')
    expect(host.textContent).toMatch(/reload/i)
  })

  it('clears this page’s site from the top row', async () => {
    const host = await mount()
    await open(host)
    await click(host.querySelector('.sd-here button'))
    expect(clearPreviewSite).toHaveBeenCalledWith('github.com')
    expect(host.querySelector('.sd-here')!.textContent).toContain('No cookies')
  })

  it('says so, and stays as it was, when a site cannot be cleared', async () => {
    clearPreviewSite.mockRejectedValueOnce(new Error('Not a site'))
    const host = await mount()
    await open(host)
    await click(host.querySelector('.sd-here button'))
    expect(host.querySelector('[role="status"]')!.textContent).toMatch(/could not clear/i)
    expect(host.querySelector('.sd-here')!.textContent).toContain('14 cookies')
  })

  it('asks before clearing all, and Keep leaves everything as it was', async () => {
    const host = await mount()
    await open(host)
    await click(btn(host, /Clear all/))
    expect(host.querySelector('[role="alert"]')!.textContent).toMatch(/every agent/i)
    expect(clearPreviewSites).not.toHaveBeenCalled()
    await click(btn(host, 'Keep'))
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(clearPreviewSites).not.toHaveBeenCalled()
  })

  it('clears all once that is confirmed', async () => {
    const host = await mount()
    await open(host)
    await click(btn(host, /Clear all/))
    await click(btn(host, 'Clear all'))
    expect(clearPreviewSites).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('vercel.com')
  })

  it('closes on Escape and on a click outside', async () => {
    const host = await mount()
    await open(host)
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await open(host)
    await act(async () => void document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('says so when no site holds cookies', async () => {
    data = { current: { host: 'x.dev', cookies: 0 }, others: [] }
    const host = await mount('https://x.dev/')
    await open(host)
    expect(host.textContent).toContain('No cookies')
    expect(btn(host, /Clear all/)).toBeUndefined()
  })
})
