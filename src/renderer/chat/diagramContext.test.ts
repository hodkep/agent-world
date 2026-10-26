import { describe, expect, it } from 'vitest'
import { diagramContext } from './diagramContext'

const source = 'flowchart TD\n  api --> db'

describe('what a diagram adds to a message', () => {
  it('is its own Mermaid source as text, so the agent reads it exactly, with a short name for the chip', () => {
    const c = diagramContext(source, [])
    expect(c.label).toBe('diagram')
    expect(c.text).toContain('```mermaid\nflowchart TD\n  api --> db\n```')
    expect(c.text).not.toMatch(/picked/i)
  })
  it('names the boxes that were picked, in the words and in the chip', () => {
    const c = diagramContext(source, ['api.ts', 'db.ts'])
    expect(c.label).toBe('diagram, picked api.ts, db.ts')
    expect(c.text).toMatch(/I picked these boxes in the diagram \(the words written on them\): api\.ts, db\.ts/)
    expect(c.text).toMatch(/Arrows cannot be picked/)
    expect(c.text).toContain('```mermaid')
  })
  it('keeps the chip short when many are picked', () => {
    const c = diagramContext(source, ['a', 'b', 'c', 'd', 'e'])
    expect(c.label).toBe('diagram, picked a, b, c and 2 more')
    expect(c.text).toContain('a, b, c, d, e')
  })
  it('counts a box once however often it was picked', () => {
    expect(diagramContext(source, ['api', 'api']).label).toBe('diagram, picked api')
  })
  it('says what the numbers mean when messages of a sequence diagram are picked', () => {
    const c = diagramContext('sequenceDiagram\n  A->>B: hi', ['message 2: read rows', 'Worker'])
    expect(c.text).toMatch(/message numbers count the arrows from the top of the diagram/i)
    expect(diagramContext(source, ['api']).text).not.toMatch(/message numbers/i)
  })
})
