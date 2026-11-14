// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillShelf } from './SkillShelf'
import type { SkillUse } from '../../shared/library'
import type { ShelfGroup } from './skillGroups'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const row = (name: string, creator: string, detail: string) => ({ key: name, name, fact: `${creator} ${detail}`, bytes: 10, creator: { name: creator, detail } })
const groups: ShelfGroup[] = [{ key: 'plugin', kind: 'plugin', title: 'Plugins', path: 'read only', bytes: 40, measured: true, rows: [row('a1', 'antv', '0.2 · MIT'), row('a2', 'antv', '0.2 · MIT'), row('g1', 'matt', '1.3 · MIT')] }]

describe('the plugins of one creator', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('sit under a heading with the creator, its version and how many it made, and the rows do not repeat it', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<SkillShelf groups={groups} others={[]} open={null} live={new Set()} onOpen={() => undefined} />))
    const heads = [...host.querySelectorAll('.sk2-cr')].map((h) => h.textContent)
    expect(heads).toEqual(['antv0.2 · MIT2', 'matt1.3 · MIT1'])
    expect(host.textContent).not.toContain('antv 0.2')
  })
})

const use = (used: number): SkillUse => ({ used, last: 0, agents: [], accounts: [], days: [...Array<number>(29).fill(0), used], who: [], projects: {} })

describe('the skills in use, or resting', () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('sit under their source like the rest, each saying what it is for and how often it was used in place of its size', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    await act(async () => createRoot(host).render(<SkillShelf groups={groups} others={[]} open="a1" live={new Set()} onOpen={() => undefined} uses={{ a1: { use: use(58), description: 'Draw charts.' } }} />))
    expect([...host.querySelectorAll('.sk2-cr')].map((h) => h.textContent)).toEqual(['antv0.2 · MIT2', 'matt1.3 · MIT1'])
    const a1 = host.querySelector('[aria-label="Open a1"]')!
    expect(a1.textContent).toContain('Draw charts.')
    expect(a1.textContent).toContain('58×')
    expect(a1.textContent).not.toContain('B')
    expect(a1.getAttribute('aria-pressed')).toBe('true')
  })
})
