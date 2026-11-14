// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { LibraryItem, SkillUse } from '../../shared/library'
import { SkillUsage } from './SkillUsage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const skill = (id: string, description: number): LibraryItem => ({ id, kind: 'skill', name: id, description: '', body: '', source: 'new', files: [], dir: `/lib/${id}`, tokens: { description, body: 0 } })
const use = (used: number): SkillUse => ({ used, last: 0, agents: [], accounts: [], days: Array<number>(30).fill(0), who: [], projects: {} })

describe("the Usage tab's skills", () => {
  afterEach(() => void (document.body.innerHTML = ''))
  it('say at the top what the skills on for Claude cost every session, and how much of it is from skills nobody used', async () => {
    const host = document.body.appendChild(document.createElement('div'))
    const items = [skill('tdd', 1000), skill('old', 9500), skill('off', 400)]
    await act(async () => createRoot(host).render(<SkillUsage items={items} usage={{ tdd: use(3) }} claudeOff={['off']} named={new Set()} projects={[]} busy={false} onClaude={() => undefined} onClear={() => undefined} onRemove={() => undefined} />))
    expect(host.querySelector('.sku-top')?.textContent).toContain('10,500 tok at the start of every Claude session, 9,500 from skills nobody used')
  })
})
