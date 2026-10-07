import { describe, expect, it } from 'vitest'
import { buildCatalog, type CatalogEntry } from './catalog'
import { tokens } from './doc'

const e = (id: string, over: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, description: `${id} does a thing`, when: 'when it applies', mode: 'on-demand', ...over })

describe('the catalog an agent can re-read', () => {
  it('has one short line per on-demand item', () => {
    const c = buildCatalog([e('tdd', { when: 'building features' }), e('pptx')])
    expect(c.split('\n').filter((l) => l.startsWith('- '))).toEqual(['- tdd: building features', '- pptx: when it applies'])
  })
  it('leaves out items that are not on demand', () => {
    expect(buildCatalog([e('terse', { mode: 'always' }), e('tdd')])).not.toContain('terse')
  })
  it('stays inside its budget however many items there are, names the rest by id, then points at search', () => {
    const many = Array.from({ length: 300 }, (_, i) => e(`skill-${i}`, { when: 'a fairly long description of when this one is the right thing to reach for' }))
    const c = buildCatalog(many, 400)
    expect(tokens(c)).toBeLessThanOrEqual(400)
    expect(c).toContain('library_search')
  })
})
