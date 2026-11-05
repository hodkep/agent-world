// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShareDay } from '../../shared/attribution'
import type { ProviderInfo } from '../../shared/types'
import { ShareTab } from './ShareTab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const providers = [{ id: 'claude', label: 'Claude Code' }] as ProviderInfo[]
const view = (key: string) => ({ key, provider: 'claude', account: key.split('\n')[1]!, name: key.endsWith('work') ? 'Work' : 'Team', color: '#fff', keeps: true })
const days = (over: Record<number, ShareDay['rows']>): { days: ShareDay[] } => ({ days: Array.from({ length: 30 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, rows: over[i + 1] ?? [] })) })
const row = (account: string, used: number, mine: number, learning = false) => ({ provider: 'claude', account, used, mine, learning })

async function setup(report: { days: ShareDay[] }, scope = 'all') {
  const shareReport = vi.fn(async () => report)
  ;(window as unknown as { aw: unknown }).aw = { shareReport }
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<ShareTab providers={providers} view={view} scope={scope} now={new Date(2026, 10, 5, 12).getTime()} />))
  return { host, shareReport }
}
const cell = (host: HTMLElement, n: number) => host.querySelector(`[data-day="2026-11-${String(n).padStart(2, '0')}"]`) as HTMLElement

describe('this app\'s share of each account, by day', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('draws the month as a cell for each day, asked for the month on show and the weekly allowance first', async () => {
    const { host, shareReport } = await setup(days({}))
    expect(shareReport).toHaveBeenCalledWith(2026, 10, 'weekly')
    expect(host.querySelectorAll('[data-day]')).toHaveLength(30)
    expect(host.textContent).toContain('November 2026')
    expect(host.textContent).toContain('Nothing was recorded for this allowance in this month.')
  })

  it('says per program and account what the app used and what others did, in the day\'s hover', async () => {
    const { host } = await setup(days({ 3: [row('work', 15, 3), row('team', 10, 6, true)] }))
    const c = cell(host, 3)
    expect(c.getAttribute('aria-label')).toBe('Tue, Nov 3: Claude Code, Work this app 3% of 15% used, others 12%; Claude Code, Team this app up to 6% of 10% used, others at least 4%')
    expect(c.querySelector('.sh-tip')!.textContent).toContain('Claude Code')
    expect(c.querySelector('.sh-tip')!.textContent).toContain('still learning')
  })

  it('draws a stripe for each account in a day, as long as its rise against the month\'s biggest day, with this app\'s part inside', async () => {
    const { host } = await setup(days({ 3: [row('work', 20, 5), row('team', 10, 10, true)], 4: [row('work', 5, 0)] }))
    const stripes = [...cell(host, 3).querySelectorAll<HTMLElement>('.sh-stripe')]
    expect(stripes.map((s) => [s.style.width, (s.firstElementChild as HTMLElement).style.width, s.classList.contains('learning')])).toEqual([['100%', '25%', false], ['50%', '100%', true]])
    // An account keeps its slot all month, so a day it was not seen leaves a gap where its stripe would be.
    expect([...cell(host, 4).querySelectorAll('.sh-stripe')].map((s) => s.classList.contains('gap'))).toEqual([false, true])
    expect(cell(host, 8).querySelectorAll('.sh-stripe')).toHaveLength(0)
  })

  it('shows only the chosen account when one is picked', async () => {
    const { host } = await setup(days({ 3: [row('work', 15, 3), row('team', 10, 6)] }), 'claude\nteam')
    expect(cell(host, 3).getAttribute('aria-label')).toBe('Tue, Nov 3: Claude Code, Team this app 6% of 10% used, others 4%')
  })

  it('moves between months and between the two allowances', async () => {
    const { host, shareReport } = await setup(days({}))
    await act(async () => void (host.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement).click())
    expect(shareReport).toHaveBeenLastCalledWith(2026, 9, 'weekly')
    await act(async () => void [...host.querySelectorAll('button')].find((b) => b.textContent === '5-hour')!.click())
    expect(shareReport).toHaveBeenLastCalledWith(2026, 9, 'five_hour')
  })
})
