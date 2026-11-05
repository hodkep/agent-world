// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillShelf } from './SkillShelf'
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
