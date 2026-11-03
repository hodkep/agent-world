import { describe, expect, it } from 'vitest'
import type { LibraryCandidate, LibraryItem } from '../../shared/library'
import { homeFolder, shelfGroups, shortPath } from './skillGroups'

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({ id, kind: 'skill', name: id, description: `${id} desc`, body: '', source: 's', files: [], dir: `/lib/skills/${id}`, tokens: { description: 5, body: 5 }, ...over })
const place = (real: string, over = {}) => ({ kind: 'global' as const, real, ...over })
const cand = (name: string, over: Partial<LibraryCandidate> = {}): LibraryCandidate => ({ source: '~/.claude/skills', name, description: '', dir: `/Users/me/.claude/skills/${name}`, real: `/Users/me/.agents/skills/${name}`, kind: 'global', ...over })

describe('the skills laid out by where they live', () => {
  it('groups them as Global, one group per project, Plugins, kept in the library, and Found, biggest first, with the group\'s total', () => {
    const items = [
      item('small', { place: place('/Users/me/.agents/skills/small'), size: { bytes: 12 * 1024, at: 1 } }),
      item('huge', { place: place('/Users/me/.agents/skills/huge', { from: 'github.com/a/huge' }), size: { bytes: 5.6 * 1024 ** 3, at: 1 } }),
      item('review', { place: place('/work/shop/.claude/skills/review', { kind: 'project', project: '/work/shop' }), size: { bytes: 220 * 1024, at: 1 } }),
      item('edit', { place: place('/Users/me/.agent-world/accounts/work/plugins/synced/b/u/skills/edit', { kind: 'plugin', from: 'iceberg 0.5.4', license: 'MIT' }) }),
      item('mine'),
      item('terse', { kind: 'instruction' })
    ]
    const g = shelfGroups(items, [cand('graphify')], '')
    expect(g.map((x) => [x.kind, x.title])).toEqual([['global', 'Global'], ['project', 'shop'], ['plugin', 'Plugins'], ['library', 'Kept in the library'], ['found', 'Found, not in the library']])
    expect(g[0]!.rows.map((r) => r.name)).toEqual(['huge', 'small'])
    expect(g[0]!.bytes).toBe(5.6 * 1024 ** 3 + 12 * 1024)
    expect(g[1]).toMatchObject({ path: '/work/shop', bytes: 220 * 1024 })
    expect(g[1]!.rows[0]!.fact).toBe('.claude/skills')
    expect(g[0]!.rows[0]!.fact).toBe('github.com/a/huge')
    expect(g[2]!.rows[0]!.fact).toBe('iceberg 0.5.4 · MIT')
    expect(g[4]!.rows[0]).toMatchObject({ name: 'graphify', found: true })
    const p = shelfGroups([], [cand('deploy', { kind: 'project', project: '/work/shop', dir: '/work/shop/.agents/skills/deploy', real: '/work/shop/.agents/skills/deploy' })], '')
    expect(p[0]!.rows[0]!.fact).toBe('shop · .agents/skills')
  })
  it('leaves out of Found what is already in the library by its folder or its name, and filters by what was typed', () => {
    const items = [item('caveman', { place: place('/Users/me/.agents/skills/caveman') }), item('graphify')]
    const found = [cand('caveman'), cand('graphify'), cand('other')]
    expect(shelfGroups(items, found, '').find((x) => x.kind === 'found')!.rows.map((r) => r.name)).toEqual(['other'])
    expect(shelfGroups(items, found, 'cave').flatMap((x) => x.rows.map((r) => r.name))).toEqual(['caveman'])
  })
  it('says a link whose folder is gone, and says when a copy has its original still there', () => {
    const items = [item('gone', { missing: true, place: place('/x/gone') }), item('vid')]
    const g = shelfGroups(items, [cand('vid', { real: '/Users/me/.agents/skills/vid' })], '')
    expect(g.find((x) => x.kind === 'global')!.rows[0]).toMatchObject({ name: 'gone', warn: 'The folder is gone' })
    const kept = g.find((x) => x.kind === 'library')!.rows[0]!
    expect(kept.warn).toBe('Its original is still at ~/.agents/skills/vid')
    expect(kept.original).toBe('/Users/me/.claude/skills/vid')
  })
  it('names a global skills folder the same wherever the home folder is', () => {
    expect(homeFolder('/private/var/T/x/user/.claude/skills')).toBe('~/.claude/skills')
    expect(homeFolder('/Users/me/.gemini/antigravity-cli/skills')).toBe('~/.gemini/antigravity-cli/skills')
    expect(homeFolder('/work/other')).toBe('/work/other')
  })
  it('shortens a path under the home folder', () => {
    expect(shortPath('/Users/pratik/Documents/Sarvaha/projects/poc/agent-world')).toBe('~/…/poc/agent-world')
    expect(shortPath('/Users/pratik/.claude/skills')).toBe('~/.claude/skills')
    expect(shortPath('/work/shop')).toBe('/work/shop')
  })
})
