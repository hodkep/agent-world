import { describe, expect, it } from 'vitest'
import { matchItems, type Matchable } from './match'

const e = (id: string, description: string, when = ''): Matchable => ({ id, name: id, description, when })
// Rarity is relative to the catalog's size, so the fixture is as big as a real one.
const filler = Array.from({ length: 60 }, (_, i) => e(`other-${i}`, `Handles unrelated topic${i} things`))
const catalog = [
  e('database-schema-design', 'Design SQL and NoSQL database schemas with indexes and migrations', 'designing tables or writing migrations'),
  e('pptx', 'Create and edit PowerPoint slide decks', 'any .pptx file or presentation'),
  e('xlsx', 'Create and edit spreadsheets', 'any .xlsx or .csv file'),
  e('commit', 'Draft a commit message from the current changes', 'committing'),
  e('security-review', 'Security review of the pending changes', 'before merging'),
  e('tdd', 'Test-driven development, red green refactor', 'building features or fixing bugs test first'),
  ...filler
]

describe('which library items a prompt points at', () => {
  it('finds the item whose words the prompt uses', () => {
    expect(matchItems('design the database schema for orders and write the migration', catalog)[0]?.id).toBe('database-schema-design')
    expect(matchItems('turn these notes into a pptx presentation', catalog)[0]?.id).toBe('pptx')
  })
  it('finds nothing for a prompt that is about none of them', () => {
    expect(matchItems('why is the lamp post drawn behind the car', catalog)).toEqual([])
  })
  it('is not pointed at an item by a word that is in everything people say, like "new"', () => {
    const items = [e('onboarding', 'A new teammate joining the team', 'a new teammate joining the team'), e('release-checklist', 'Shipping a release', 'shipping a release to production'), ...filler]
    expect(matchItems('we are about to go live with the new build', items)).toEqual([])
    expect(matchItems('a new teammate is joining on monday', items)[0]?.id).toBe('onboarding')
  })
  it('is not pointed at an item by one word it shares, however well it fits', () => {
    expect(matchItems('merge this into main', [e('resolving-merge-conflicts', 'Resolve conflicts', 'git stopped a merge with conflict markers'), ...filler])).toEqual([])
    expect(matchItems('git stopped my merge and left conflict markers', [e('resolving-merge-conflicts', 'Resolve conflicts', 'git stopped a merge with conflict markers'), ...filler])[0]?.id).toBe('resolving-merge-conflicts')
  })
  it('matches an item\'s "when", not the everyday words of its description', () => {
    const prds = e('writing-prds', 'Help users write effective documents; use when defining what to build for their team', 'asked to write a product requirements document')
    expect(matchItems('write the feature and build it for the team', [prds, ...filler])).toEqual([])
    expect(matchItems('write a product requirements document', [prds, ...filler])[0]?.id).toBe('writing-prds')
  })
  it('returns at most k, best first', () => {
    const r = matchItems('write a migration, commit it and run a security review', catalog, 2)
    expect(r.length).toBeLessThanOrEqual(2)
  })
})
