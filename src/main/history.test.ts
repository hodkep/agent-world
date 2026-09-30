import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSessions, projectSlug, titleOf } from './history'

const line = (o: object) => JSON.stringify(o) + '\n'
const user = (content: unknown) => line({ type: 'user', message: { role: 'user', content } })

describe('project slug', () => {
  it("matches the folder name Claude keeps a project's sessions in", () => {
    expect(projectSlug('/Users/dev/my.repo/app')).toBe('-Users-pratik-my-repo-app')
  })
})

describe('session title', () => {
  it('is the first real user message, on one line and trimmed', () => {
    const text = line({ type: 'queue-operation' }) + user('<command-name>/clear</command-name>') + user('Fix the\n login   bug please') + user('later')
    expect(titleOf(text)).toBe('Fix the login bug please')
  })

  it('reads text blocks and shortens long prompts', () => {
    expect(titleOf(user([{ type: 'text', text: 'x'.repeat(200) }]))).toHaveLength(80)
  })

  it('is empty when there is no user message', () => {
    expect(titleOf(line({ type: 'attachment' }))).toBe('')
  })
})

describe('listing sessions', () => {
  let root: string
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), 'aw-hist-'))))
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  const put = (slug: string, id: string, body: string, when: number) => {
    mkdirSync(join(root, slug), { recursive: true })
    const f = join(root, slug, `${id}.jsonl`)
    writeFileSync(f, body)
    utimesSync(f, when, when)
  }

  it('lists sessions of the given folders, newest first, skipping empty ones', () => {
    put('-repo', 'a', user('old work'), 1000)
    put('-repo', 'b', user('new work'), 2000)
    put('-repo-wt', 'c', user('worktree work'), 1500)
    put('-repo', 'e', line({ type: 'attachment' }), 3000)
    put('-other', 'd', user('elsewhere'), 4000)
    expect(listSessions(root, ['-repo', '-repo-wt'])).toEqual([
      { id: 'b', title: 'new work', updated: 2000_000 },
      { id: 'c', title: 'worktree work', updated: 1500_000 },
      { id: 'a', title: 'old work', updated: 1000_000 }
    ])
  })

  it('returns nothing when the folder has no history', () => {
    expect(listSessions(root, ['-nope'])).toEqual([])
  })
})
