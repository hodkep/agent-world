import { describe, expect, it } from 'vitest'
import type { LibraryCandidate, LibraryItem } from '../../shared/library'
import { homeFolder, importable, shelfGroups, shortPath } from './skillGroups'

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
  it('keeps the plugins of one creator together, with the creator and its version on the row', () => {
    const plug = (id: string, from: string, bytes: number) => item(id, { place: place(`/p/${id}`, { kind: 'plugin', from, license: 'MIT' }), size: { bytes, at: 1 } })
    const g = shelfGroups([plug('b-big', 'beta-skills 2.0.0', 900), plug('a-one', 'antv-skills 0.2.14', 10), plug('b-small', 'beta-skills 2.0.0', 5), plug('a-two', 'antv-skills 0.2.14', 20)], [], '').find((x) => x.kind === 'plugin')!
    expect(g.rows.map((r) => r.name)).toEqual(['a-two', 'a-one', 'b-big', 'b-small'])
    expect(g.rows[0]!.creator).toEqual({ name: 'antv-skills', detail: '0.2.14 · MIT' })
    expect(g.rows[2]!.creator).toEqual({ name: 'beta-skills', detail: '2.0.0 · MIT' })
  })
  it('groups skills in Global and in each project by where they came from, those with no source under "Added by hand" with their folder', () => {
    const items = [
      item('pdf', { place: place('/Users/me/.agents/skills/pdf', { from: 'vercel-labs/skills' }), size: { bytes: 5, at: 1 } }),
      item('find', { place: place('/Users/me/.agents/skills/find', { from: 'vercel-labs/skills' }), size: { bytes: 9, at: 1 } }),
      item('chirp', { place: place('/Users/me/.claude/skills/chirp'), size: { bytes: 50, at: 1 } }),
      item('deploy', { place: place('/work/shop/.claude/skills/deploy', { kind: 'project', project: '/work/shop', from: 'vercel-labs/skills' }) }),
      item('review', { place: place('/work/shop/.claude/skills/review', { kind: 'project', project: '/work/shop' }) })
    ]
    const g = shelfGroups(items, [], '')
    expect(g[0]!.rows.map((r) => [r.name, r.creator])).toEqual([
      ['find', { name: 'vercel-labs/skills', detail: '' }],
      ['pdf', { name: 'vercel-labs/skills', detail: '' }],
      ['chirp', { name: 'Added by hand', detail: '~/.claude/skills' }]
    ])
    expect(g[1]!.rows.map((r) => r.creator?.name)).toEqual(['vercel-labs/skills', 'Added by hand'])
    expect(g[1]!.rows[1]!.creator!.detail).toBe('.claude/skills')
  })
  it('shortens a path under the home folder', () => {
    expect(shortPath('/Users/pratik/Documents/Sarvaha/projects/poc/agent-world')).toBe('~/…/poc/agent-world')
    expect(shortPath('/Users/pratik/.claude/skills')).toBe('~/.claude/skills')
    expect(shortPath('/work/shop')).toBe('/work/shop')
  })
  it('offers to import each skill found once, and nothing the library holds already by its folder, its name or the folder a link leads to', () => {
    const items = [item('caveman', { place: place('/Users/me/.agents/skills/caveman') }), item('graphify'), item('viaLink', { place: place('/real/vialink') })]
    const found = [
      cand('caveman'),
      cand('graphify'),
      cand('pptx', { dir: '/Users/me/.claude/skills/pptx', real: '/Users/me/.agents/skills/pptx', source: '~/.claude/skills' }),
      cand('pptx', { dir: '/Users/me/.agents/skills/pptx', real: '/Users/me/.agents/skills/pptx', source: '~/.agents/skills' }),
      cand('other-name', { dir: '/x/vialink-alias', real: '/real/vialink' }),
      cand('twin', { dir: '/a/twin', real: '/a/twin' }),
      cand('twin', { dir: '/b/twin', real: '/b/twin' })
    ]
    const rows = importable(items, found, '')
    expect(rows.map((r) => r.name)).toEqual(['pptx', 'twin'])
    expect(rows[0]!.also).toEqual(['~/.agents/skills'])
    expect(rows[1]!.also).toEqual(['~/.claude/skills'])
    expect(importable(items, found, 'ppt').map((r) => r.name)).toEqual(['pptx'])
  })
})
