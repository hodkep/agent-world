import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSessions, projectSlug, titleOf } from './history'

const line = (o: object) => JSON.stringify(o) + '\n'
const user = (content: unknown) => line({ type: 'user', message: { role: 'user', content } })

describe('project slug', () => {
  it("matches the folder name Claude keeps a project's sessions in", () => {
    expect(projectSlug('/Users/dev/my.repo/app')).toBe('-Users-dev-my-repo-app')
  })
})

describe('session title', () => {
  it('is the first real user message, on one line and trimmed', () => {
    const text = line({ type: 'queue-operation' }) + user('<command-name>/clear</command-name>') + user('Fix the\n login   bug please') + user('later')
    expect(titleOf(text)).toBe('Fix the login bug please')
  })

  it('reads text blocks and shortens long prompts', () => {
    expect(titleOf(user([{ type: 'text', text: 'x'.repeat(200) }]))).toHaveLength(160)
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

  it('lists sessions of the given folders, newest first, skipping empty ones', async () => {
    put('-repo', 'a', user('old work'), 1000)
    put('-repo', 'b', user('new work'), 2000)
    put('-repo-wt', 'c', user('worktree work'), 1500)
    put('-repo', 'e', line({ type: 'attachment' }), 3000)
    put('-other', 'd', user('elsewhere'), 4000)
    expect(await listSessions(root, ['-repo', '-repo-wt'])).toEqual([
      { id: 'b', title: 'new work', updated: 2000_000, bytes: expect.any(Number) },
      { id: 'c', title: 'worktree work', updated: 1500_000, bytes: expect.any(Number) },
      { id: 'a', title: 'old work', updated: 1000_000, bytes: expect.any(Number) }
    ])
  })

  it('reports how big each saved conversation is', async () => {
    const body = user('some work')
    put('-repo', 'a', body, 1000)
    expect((await listSessions(root, ['-repo']))[0]!.bytes).toBe(Buffer.byteLength(body))
  })

  it('returns nothing when the folder has no history', async () => {
    expect(await listSessions(root, ['-nope'])).toEqual([])
  })

  it('reads only as many of the newest sessions as asked for', async () => {
    for (let i = 1; i <= 30; i++) put('-repo', `s${i}`, user(`work ${i}`), i * 1000)
    const got = await listSessions(root, ['-repo'], 5)
    expect(got.map((x) => x.id)).toEqual(['s30', 's29', 's28', 's27', 's26'])
  })

  it('still fills the limit when some of the newest have no prompt', async () => {
    put('-repo', 'old', user('old work'), 1000)
    put('-repo', 'blank', line({ type: 'attachment' }), 9000)
    expect((await listSessions(root, ['-repo'], 2)).map((x) => x.id)).toEqual(['old'])
  })
})
