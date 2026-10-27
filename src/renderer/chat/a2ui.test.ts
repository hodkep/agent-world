import { describe, expect, it } from 'vitest'
import { actionText, describeAnswer, parseFormAnswer, parseSurface, read, resolve, surfaceIn, write } from './a2ui'

const form = [
  { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: 'basic' } },
  { version: 'v0.9', updateComponents: { surfaceId: 's1', components: [
    { id: 'root', component: 'Column', children: ['title', 'name', 'go'] },
    { id: 'title', component: 'Text', text: 'Pick', variant: 'h2' },
    { id: 'name', component: 'TextField', label: 'Name', value: { path: '/name' } },
    { id: 'go', component: 'Button', child: 'golabel', action: { event: { name: 'chosen', context: { who: { path: '/name' } } } } },
    { id: 'golabel', component: 'Text', text: 'Go' }
  ] } },
  { version: 'v0.9', updateDataModel: { surfaceId: 's1', path: '/name', value: 'ada' } }
]

describe('an A2UI surface in a reply', () => {
  it('is read from a list of messages, a single message or one message a line, with its data', () => {
    const s = parseSurface(JSON.stringify(form))!
    expect(s.id).toBe('s1')
    expect(Object.keys(s.components)).toEqual(['root', 'title', 'name', 'go', 'golabel'])
    expect(s.data).toEqual({ name: 'ada' })
    expect(parseSurface(form.map((m) => JSON.stringify(m)).join('\n'))!.id).toBe('s1')
    expect(parseSurface(JSON.stringify(form[1]))!.components.root).toBeDefined()
  })

  it('is refused when it names a component outside the catalog, a child that is not there, no root, or a loop', () => {
    const with_ = (components: unknown[]) => JSON.stringify({ version: 'v0.9', updateComponents: { surfaceId: 'x', components } })
    expect(parseSurface(with_([{ id: 'root', component: 'Script', src: 'x' }]))).toBeNull()
    expect(parseSurface(with_([{ id: 'root', component: 'Column', children: ['gone'] }]))).toBeNull()
    expect(parseSurface(with_([{ id: 'a', component: 'Text', text: 'x' }]))).toBeNull()
    expect(parseSurface(with_([{ id: 'root', component: 'Column', children: ['root'] }]))).toBeNull()
    expect(parseSurface('not json')).toBeNull()
    expect(parseSurface('{"hello":1}')).toBeNull()
  })

  it('reads and writes its data by path without changing the old copy, and a value is a literal or a path', () => {
    const d = { a: { b: 1 }, list: ['x'] }
    expect(read(d, '/a/b')).toBe(1)
    expect(read(d, '/nope/b')).toBeUndefined()
    const n = write(d, '/a/c', 2)
    expect(n).toEqual({ a: { b: 1, c: 2 }, list: ['x'] })
    expect(d).toEqual({ a: { b: 1 }, list: ['x'] })
    expect(resolve({ path: '/a/b' }, d)).toBe(1)
    expect(resolve('plain', d)).toBe('plain')
    expect(resolve(3, d)).toBe(3)
  })

  it('turns a click into the words the agent receives: the action with its context resolved from the data', () => {
    const s = parseSurface(JSON.stringify(form))!
    const text = actionText(s, 'go', s.data, new Date('2026-10-26T10:00:00Z'))
    expect(text).toContain('chosen')
    expect(JSON.parse(text.slice(text.indexOf('{')))).toEqual({ version: 'v0.9', action: { name: 'chosen', surfaceId: 's1', sourceComponentId: 'go', timestamp: '2026-10-26T10:00:00.000Z', context: { who: 'ada' } } })
  })
})

describe('the answer to a form, drawn for the person', () => {
  const pick = [
    { version: 'v0.9', createSurface: { surfaceId: 'x', catalogId: 'basic' } },
    { version: 'v0.9', updateComponents: { surfaceId: 'x', components: [
      { id: 'root', component: 'Card', child: 'col' },
      { id: 'col', component: 'Column', children: ['t', 'look', 'sure', 'go'] },
      { id: 't', component: 'Text', variant: 'h3', text: 'Which mark?' },
      { id: 'look', component: 'ChoicePicker', label: 'Look', variant: 'mutuallyExclusive', options: [{ label: 'A · Ring', value: 'a' }, { label: 'B · Title', value: 'b' }], value: { path: '/look' } },
      { id: 'sure', component: 'CheckBox', label: 'Sure?', value: { path: '/sure' } },
      { id: 'go', component: 'Button', child: 'gol', action: { event: { name: 'chosen', context: { look: { path: '/look' }, sure: { path: '/sure' } } } } },
      { id: 'gol', component: 'Text', text: 'Build' }
    ] } }
  ]
  const surface = () => parseSurface(JSON.stringify(pick))!

  it('is read back from the text the agent is sent, and other text is no answer', () => {
    const a = parseFormAnswer(actionText(surface(), 'go', { look: ['b'], sure: true }))!
    expect(a).toMatchObject({ name: 'chosen', surfaceId: 'x', sourceComponentId: 'go', context: { look: ['b'], sure: true } })
    expect(parseFormAnswer('A2UI action "x" (the answer to the form you showed): not json')).toBeNull()
    expect(parseFormAnswer('hello')).toBeNull()
  })

  it('names the form and each field with the label of what was picked, a yes or no, or the words typed', () => {
    expect(describeAnswer(surface(), 'go', { look: ['b'], sure: true })).toEqual({ title: 'Which mark?', rows: [{ label: 'Look', value: 'B · Title' }, { label: 'Sure?', value: 'yes' }] })
    expect(describeAnswer(parseSurface(JSON.stringify(form))!, 'go', { who: 'ada' })).toEqual({ title: 'Pick', rows: [{ label: 'Name', value: 'ada' }] })
    // A key the form does not bind is shown as it is.
    expect(describeAnswer(surface(), 'go', { extra: 3 })).toEqual({ title: 'Which mark?', rows: [{ label: 'extra', value: '3' }] })
  })

  it('finds the form by its id among the a2ui blocks of a reply', () => {
    const reply = `Pick one:\n\n\`\`\`a2ui\n${JSON.stringify(form)}\n\`\`\`\n\nor\n\n\`\`\`a2ui\n${JSON.stringify(pick)}\n\`\`\`\n`
    expect(surfaceIn(reply, 'x')?.components.look).toBeDefined()
    expect(surfaceIn(reply, 's1')?.components.name).toBeDefined()
    expect(surfaceIn(reply, 'nope')).toBeUndefined()
  })
})
