// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Place, Storage } from '../../shared/storage'
import { StorageTab } from './StorageTab'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const GB = 1024 ** 3
const place = (name: string, gb: number, kind: Place['kind'], over: Partial<Place> = {}): Place => ({ id: name, name, note: kind === 'agent' ? 'worktree · last active 9 days ago' : '', bytes: gb * GB, regen: 0, kind, ...over })
const ws = (name: string, places: Place[]): Storage => ({ path: `/p/${name}`, name, bytes: places.reduce((n, p) => n + p.bytes, 0), places })
const app = ws('agent-world', [place('Project folder', 0.7, 'folder', { note: 'os works here' }), place('delta', 2.7, 'agent', { regen: 1.2 * GB }), place('review-1', 0, 'sub', { of: 'delta', note: "subagent · shares delta's folder" }), place('old-pr-fix', 0.5, 'orphan', { note: 'no agent', regen: 0.1 * GB })])
const other = ws('nhm-csr', [place('Project folder', 1.6, 'folder')])
const data = ws('Agent World data', [place('ledger.jsonl', 0.3, 'data')])
const report = { at: Date.now() - 120_000, measuring: false, workspaces: [other, app], data, active: '/p/agent-world' }

async function setup(r: typeof report) {
  const storageReport = vi.fn(async () => r)
  const measureStorage = vi.fn(async () => undefined)
  let tell = () => {}
  const onStorage = vi.fn((cb: () => void) => ((tell = cb), () => {}))
  ;(window as unknown as { aw: unknown }).aw = { storageReport, measureStorage, onStorage }
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<StorageTab now={Date.now()} />))
  return { host, storageReport, measureStorage, tell: () => act(async () => tell()) }
}
const text = (host: HTMLElement) => host.textContent ?? ''

describe('what each workspace takes on disk', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('draws a block for each workspace and the app\'s data, and opens the project this window is on', async () => {
    const { host } = await setup(report)
    expect([...host.querySelectorAll('.sg-block')].map((b) => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('agent-world'), expect.stringContaining('nhm-csr'), expect.stringContaining('Agent World data')]))
    expect(host.querySelector('.sg-block.on')!.textContent).toContain('agent-world')
    expect(text(host)).toContain('Project folder')
    expect(text(host)).toContain('delta')
  })

  it('lists where the agents work: a subagent under its parent, an orphan marked as having no agent', async () => {
    const { host } = await setup(report)
    const rows = [...host.querySelectorAll('.sg-row')]
    expect(rows.map((r) => r.querySelector('.sg-n')!.firstChild!.textContent)).toEqual(['Project folder', 'delta', 'review-1', 'old-pr-fix'])
    expect(rows[2]!.classList.contains('in')).toBe(true)
    expect(rows[2]!.textContent).toContain("subagent · shares delta's folder")
    expect(rows[3]!.textContent).toContain('no agent')
    expect(rows[1]!.querySelector('b')!.textContent).toBe('2.7 GB')
  })

  it('opens another workspace\'s places, and the app\'s own folder, when its block is clicked', async () => {
    const { host } = await setup(report)
    await act(async () => void ([...host.querySelectorAll<HTMLElement>('.sg-block')].find((b) => b.textContent!.includes('nhm-csr'))!.click()))
    expect([...host.querySelectorAll('.sg-row')].map((r) => r.querySelector('.sg-n')!.firstChild!.textContent)).toEqual(['Project folder'])
    await act(async () => void ([...host.querySelectorAll<HTMLElement>('.sg-block')].find((b) => b.textContent!.includes('Agent World data'))!.click()))
    expect(text(host)).toContain('ledger.jsonl')
  })

  it('says what could be freed, as lines that name the place and the command, and does nothing itself', async () => {
    const { host } = await setup(report)
    const free = host.querySelector('.sg-free')!
    expect(free.textContent).toContain('Could free')
    expect(free.textContent).toContain('1.2 GB')
    expect(free.textContent).toContain('node_modules, dist and caches in 1 worktree.')
    expect(free.textContent).toContain('git worktree remove <path>')
    expect(free.querySelector('button')).toBeNull()
  })

  it('says when it was measured, measures again on the button, and shows a run under way', async () => {
    const { host, measureStorage, tell } = await setup(report)
    expect(text(host)).toContain('Measured 2 min ago')
    await act(async () => void (host.querySelector<HTMLButtonElement>('.sg-again')!.click()))
    expect(measureStorage).toHaveBeenCalledTimes(1)
    const { host: h2 } = await setup({ ...report, at: null as never, measuring: true, workspaces: [] })
    expect(text(h2)).toContain('Measuring')
    await tell()
  })

  it('measures at once the first time, when nothing was ever measured', async () => {
    const { measureStorage } = await setup({ ...report, at: null as never, workspaces: [], data: null as never })
    expect(measureStorage).toHaveBeenCalledTimes(1)
  })

  it('lays the workspaces out as a treemap: each tile\'s area follows its size, the biggest is top left, and they fill the box', async () => {
    const { host } = await setup(report)
    const tiles = [...host.querySelectorAll<HTMLElement>('.sg-block')]
    const pct = (t: HTMLElement) => ({ x: parseFloat(t.style.left), y: parseFloat(t.style.top), w: parseFloat(t.style.width), h: parseFloat(t.style.height) })
    const rects = tiles.map(pct)
    expect([...host.querySelectorAll<HTMLElement>('.sg-block, .sg-more')].map(pct).reduce((n, r) => n + (r.w * r.h) / 100, 0)).toBeCloseTo(100, 1)
    const big = tiles.findIndex((t) => t.textContent!.includes('agent-world'))
    expect(rects[big]).toMatchObject({ x: 0, y: 0 })
    // agent-world is 3.9 GB of the 5.6 GB shown (the app's data is 0.3), nhm-csr 1.6: the areas keep that order.
    const areaOf = (name: string) => { const r = rects[tiles.findIndex((t) => t.textContent!.includes(name))]!; return r.w * r.h }
    expect(areaOf('agent-world')).toBeGreaterThan(areaOf('nhm-csr'))
    expect((host.querySelector('.sg-map') as HTMLElement).style.height).toBe('260px')
  })

  it('folds tiles too small to read into one "smaller" tile that is not a button, and keeps the open workspace\'s own tile however small', async () => {
    const sizes = [100, 50, 30, 20, 10, 1, 1, 1]
    const many = sizes.map((g, i) => ws(`w${i}`, [place('Project folder', g, 'folder')]))
    const { host } = await setup({ ...report, workspaces: many, data: null as never, active: '/p/w7' })
    const names = [...host.querySelectorAll('.sg-block')].map((b) => b.querySelector('span')!.textContent)
    expect(names).toEqual(expect.arrayContaining(['w0', 'w4', 'w7']))
    expect(names).not.toContain('w5')
    const more = host.querySelector('.sg-more')!
    expect(more.textContent).toContain('2 smaller')
    expect(more.tagName).not.toBe('BUTTON')
    expect(host.querySelector('.sg-block.on')!.textContent).toContain('w7')
  })

  it('has no smaller tile when every workspace is big enough to read', async () => {
    const { host } = await setup({ ...report, data: ws('Agent World data', [place('ledger.jsonl', 1, 'data')]) })
    expect(host.querySelector('.sg-more')).toBeNull()
  })
})
