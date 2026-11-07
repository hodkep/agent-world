import { describe, expect, it } from 'vitest'
import type { Row } from './format'
import { groupBrowser } from './browserGroup'
import { groupSteps } from './stepGroups'

const TOOL = 'npx -y agent-browser@0.41.2'
const bash = (id: string, command: string, result?: string): Row => ({ kind: 'tool', id, run: { name: 'Bash', input: { command }, ...(result !== undefined && { result: { text: result, isError: false } }) } })
const think = (id: string): Row => ({ kind: 'thinking', id })
const say = (id: string): Row => ({ kind: 'assistant', id, text: 'ok' })
const kinds = (rows: { kind: string }[]) => rows.map((r) => r.kind)

describe('naming controls across cards', () => {
  it('gives a group the controls named in the page snapshots of the groups before it, since a message between them ends one card and not the page', () => {
    const snap = '- button "Sign in" [ref=e8]\n- textbox "Username" [ref=e9]'
    const out = groupBrowser([bash('a', `${TOOL} snapshot -i`, snap), say('m'), bash('b', `${TOOL} click @e8`)])
    const groups = out.filter((r) => r.kind === 'browser') as { refs: Record<string, string> }[]
    expect(groups[0]!.refs).toEqual({})
    expect(groups[1]!.refs).toEqual({ e8: 'Sign in', e9: 'Username' })
  })
})

describe('a run of browser commands in the chat', () => {
  it('is one group, a single command too', () => {
    const out = groupBrowser([bash('a', `${TOOL} open http://localhost:5391`), bash('b', `${TOOL} snapshot -i`), bash('c', `${TOOL} click @e2`)])
    expect(kinds(out)).toEqual(['browser'])
    expect(out[0]).toMatchObject({ kind: 'browser', id: 'a' })
    expect((out[0] as { calls: unknown[] }).calls).toHaveLength(3)
    expect(kinds(groupBrowser([bash('a', `${TOOL} get url`)]))).toEqual(['browser'])
  })

  it('takes in the thinking between its commands, and gives back the thinking that comes after the last one', () => {
    const out = groupBrowser([bash('a', `${TOOL} open http://x.dev`), think('t1'), bash('b', `${TOOL} snapshot`), think('t2')])
    expect(kinds(out)).toEqual(['browser', 'thinking'])
    expect((out[0] as { calls: unknown[] }).calls).toHaveLength(2)
  })

  it('is ended by a message, and by a command that is not the browser', () => {
    expect(kinds(groupBrowser([bash('a', `${TOOL} open http://x.dev`), say('m'), bash('b', `${TOOL} snapshot`)]))).toEqual(['browser', 'assistant', 'browser'])
    expect(kinds(groupBrowser([bash('a', `${TOOL} open http://x.dev`), bash('b', 'ls -la'), bash('c', `${TOOL} snapshot`)]))).toEqual(['browser', 'tool', 'browser'])
  })

  it('leaves every other command alone', () => {
    const rows = [bash('a', 'ls'), bash('b', 'npm i agent-browser'), say('m')]
    expect(groupBrowser(rows)).toEqual(rows)
  })

  it('goes through the step grouping as it is, and ends a group of ordinary steps', () => {
    const out = groupSteps(groupBrowser([bash('a', 'ls'), bash('b', 'pwd'), bash('c', `${TOOL} open http://x.dev`), bash('d', `${TOOL} snapshot`), bash('e', 'ls'), bash('f', 'pwd')]))
    expect(kinds(out)).toEqual(['group', 'browser', 'group'])
  })
})
