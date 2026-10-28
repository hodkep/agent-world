// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { StepGroup } from './stepGroups'

// A module down the import chain asks the window about its colour scheme as it loads; jsdom has no such question.
Object.defineProperty(window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) })
const { StepGroupView } = await import('./StepGroupView')

const tool = (id: string, done: boolean) => ({ kind: 'tool' as const, id, run: { id, name: 'Bash', input: { command: 'ls' }, at: 1, ...(done && { result: { text: 'ok', isError: false } }) } as never })
const group = (steps: StepGroup['steps']): StepGroup => ({ kind: 'group', id: 'g', steps })
const html = (g: StepGroup, active: boolean) => renderToStaticMarkup(<StepGroupView group={g} active={active} onImage={() => {}} />)

describe('a working group between steps', () => {
  it('says the agent is thinking while it works with its last step finished, so the card never goes quiet', () => {
    expect(html(group([tool('a', true), tool('b', true)]), true)).toContain('Thinking')
    expect(html(group([tool('a', true), { kind: 'thinking', id: 't', took: 24 }]), true)).toContain('Thinking…')
  })
  it('says nothing extra while the last step still runs, or once the group is done', () => {
    expect(html(group([tool('a', true), tool('b', false)]), true)).not.toContain('Thinking…')
    expect(html(group([tool('a', true), tool('b', true)]), false)).not.toContain('Thinking…')
  })
})
