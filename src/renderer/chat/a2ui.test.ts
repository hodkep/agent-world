import { describe, expect, it } from 'vitest'
import { actionText, parseSurface, read, resolve, write } from './a2ui'

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
