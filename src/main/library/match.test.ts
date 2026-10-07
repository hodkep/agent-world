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
    expect(matchItems('turn these notes into a presentation', catalog)[0]?.id).toBe('pptx')
  })
  it('finds nothing for a prompt that is about none of them', () => {
    expect(matchItems('why is the lamp post drawn behind the car', catalog)).toEqual([])
  })
  it('returns at most k, best first', () => {
    const r = matchItems('write a migration, commit it and run a security review', catalog, 2)
    expect(r.length).toBeLessThanOrEqual(2)
  })
})
