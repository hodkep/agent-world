// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type AgentActions, type AgentInfo, MoreMenu } from './AgentControls'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const info = (over: Partial<AgentInfo> = {}): AgentInfo => ({ model: null, effort: null, fast: false, contextPct: null, costUsd: 0, linesAdded: 0, linesRemoved: 0, branch: 'aw/ada', canSwitch: true, started: true, ...over })
const actions = (): AgentActions => ({ switchTo: vi.fn(), roles: [], setRole: vi.fn(), reviewers: [], askReview: vi.fn(), handoff: vi.fn(), clone: vi.fn(), compact: vi.fn(), handbook: vi.fn(), memory: vi.fn(), rename: vi.fn(), group: vi.fn(), restart: vi.fn(), remove: vi.fn() })

async function open(i: AgentInfo = info(), a: AgentActions = actions()) {
  const host = document.body.appendChild(document.createElement('div'))
  await act(async () => createRoot(host).render(<MoreMenu info={i} actions={a} />))
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')!.click())
  const menu = host.querySelector('[role="menu"]')!
  const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  const named = (n: string) => items().find((x) => x.textContent!.startsWith(n))!
  return { host, menu, items, named, a }
}

describe('the More actions menu', () => {
  afterEach(() => void (document.body.innerHTML = ''))

  it('keeps the four tiles in one row, each with its label, and what each is for as its hover hint', async () => {
    const { menu } = await open()
    const tiles = [...menu.querySelectorAll<HTMLElement>('.cb-tile')]
    expect(tiles.map((t) => t.textContent)).toEqual(['Review', 'Clone', 'Handbook', 'Memory'])
    expect(tiles.map((t) => t.title)).toEqual(['Ask a peer to look at the branch', 'Fork this chat into a new branch', 'CLAUDE.md', 'Notes every agent in this project shares'])
  })

  it('groups the rows under Hand over, Manage and Session, each action on its own row', async () => {
    const { menu } = await open()
    expect([...menu.querySelectorAll('h6')].map((h) => h.textContent)).toEqual(['Hand over', 'Manage', 'Session'])
    const rows = [...menu.querySelectorAll<HTMLElement>('.cb-row')].map((r) => r.querySelector('.cb-name')!.textContent)
    expect(rows).toEqual(['Hand off…', 'Rename', 'Change role…', 'Group…', 'Restart agent', 'Remove agent'])
  })

  it('says in a line what a row does or where it stands now', async () => {
    const { named } = await open(info({ role: 'Reviewer' }))
    expect(named('Hand off').textContent).toContain('Give this branch to another agent')
    expect(named('Change role').textContent).toContain('Now: Reviewer')
    expect(named('Restart agent').textContent).toContain('Same conversation, fresh program')
    expect((await open(info())).named('Change role').textContent).toContain('Now: no role')
  })

  it('has Remove agent alone at the bottom, behind a rule, in the danger colour', async () => {
    const { menu } = await open()
    const last = [...menu.children].at(-1)!
    expect(last.textContent).toContain('Remove agent')
    expect(last.classList.contains('danger')).toBe(true)
    expect(last.previousElementSibling!.classList.contains('cb-sep')).toBe(true)
  })

  it('leaves out Hand over, Review and Handbook for an agent with no branch', async () => {
    const { menu } = await open(info({ branch: null }))
    expect([...menu.querySelectorAll('h6')].map((h) => h.textContent)).toEqual(['Manage', 'Session'])
    expect([...menu.querySelectorAll('.cb-tile')].map((t) => t.textContent)).toEqual(['Clone', 'Memory'])
  })

  it('runs the action of a row and closes the menu', async () => {
    const { host, named, a } = await open()
    await act(async () => named('Rename').click())
    expect(a.rename).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="menu"]')).toBeNull()
  })
})
