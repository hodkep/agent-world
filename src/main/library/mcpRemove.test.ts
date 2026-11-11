import { describe, expect, it } from 'vitest'
import type { McpServer } from '../../shared/mcp'
import { planRemoval } from './mcpRemove'

const srv = (where: McpServer['where'], project?: string, over: Partial<McpServer> = {}): McpServer => ({
  id: `${where}:${project ?? ''}:${over.path ?? '~/.claude.json'}:supabase`, name: 'supabase', transport: 'stdio', fact: 'npx x', env: ['T'], where, path: '~/.claude.json', readOnly: false, editable: true, ...(project && { project }), ...over
})
const g = srv('global')
const pa = srv('project', '/w/a')
const pb = srv('project', '/w/b', { path: '/w/b/.mcp.json' })
const all = [g, pa, pb, srv('agy-cli', undefined, { path: '/agy.json', readOnly: true }), srv('project', '/w/z', { fact: 'npx other' }), srv('plugin', undefined, { editable: false, readOnly: true })]

describe('taking an MCP server out of its places', () => {
  it('one place: just that one', () => {
    expect(planRemoval(all, g, 'one', pa.id).steps.map((s) => [s.action, s.id])).toEqual([['remove', pa.id]])
  })
  it('refuses a place the row does not have, and one that cannot be edited', () => {
    expect(() => planRemoval(all, g, 'one', 'nope')).toThrow(/not one of its places/)
    expect(() => planRemoval(all, g, 'one', all[5]!.id)).toThrow(/not one of its places/)
  })
  it('every project: the project lists and .mcp.json files, with the repo ones marked, and never the global, agy\'s list, a plugin\'s or one of another definition', () => {
    const p = planRemoval(all, g, 'projects')
    expect(p.steps.map((s) => [s.id, s.repo])).toEqual([[pa.id, false], [pb.id, true]])
  })
  it('every place: the global too', () => {
    expect(planRemoval(all, g, 'all').steps.map((s) => s.id)).toEqual([g.id, pa.id, pb.id])
  })
  it('keep one global: removes the project ones when a global exists', () => {
    expect(planRemoval(all, g, 'keep-global').steps.map((s) => s.action)).toEqual(['remove', 'remove'])
  })
  it('keep one global with none: copies it into Claude\'s own file first, from a place that is not a repo\'s', () => {
    const p = planRemoval([pa, pb], pa, 'keep-global', undefined, '/home/.claude.json')
    expect(p.steps.map((s) => [s.action, s.id])).toEqual([['add-global', pa.id], ['remove', pa.id], ['remove', pb.id]])
    expect(p.steps[0]!.path).toBe('/home/.claude.json')
  })
  it('refuses to make a global from a repo\'s own .mcp.json, which the person has not seen as their own', () => {
    expect(() => planRemoval([pb], pb, 'keep-global', undefined, '/home/.claude.json')).toThrow(/come with a repo/)
  })
  it('says so when there is nothing to remove', () => {
    expect(() => planRemoval([g], g, 'projects')).toThrow(/not in any project/)
  })
})
