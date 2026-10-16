import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HOOK_NAMES, blockText, branchHead, currentBranch, gitEnv, holdsBranch, isInside, movesBase, originalHooks, stagedFiles, writeGitHooks } from './commitGate'

const dirs: string[] = []
const servers: Server[] = []
afterEach(() => servers.splice(0).forEach((s) => s.close()))
const tmp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gate-')))
  dirs.push(d)
  return d
}
const run = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((resolve) =>
    execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env } }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout}${stderr}` }))
  )
async function repo() {
  const root = tmp()
  const work = join(root, 'work')
  mkdirSync(work)
  await run(work, {}, 'init', '-q', '-b', 'main')
  writeFileSync(join(work, 'a.txt'), 'a\n')
  await run(work, {}, 'add', '-A')
  await run(work, {}, 'commit', '-qm', 'init')
  return { root, work }
}
const stub = async (answer: object | null, refAnswer: object = {}) => {
  const seen: { url?: string; auth?: string; body?: string }[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, body })
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(req.url?.endsWith('/git-ref') ? refAnswer : (answer ?? {})))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  servers.push(server)
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, seen }
}
const agentEnv = (hooks: string, url: string, orig = '') => ({ ...gitEnv({}, hooks, orig), AW_MCP_URL: url, AW_AGENT_TOKEN: 'tok-1' })

describe('the environment that points git at the office\'s hooks', () => {
  it('sets git\'s own configuration through the environment, not any file, and says where the repository\'s hooks are', () => {
    expect(gitEnv({}, '/home/hooks', '/work/.git/hooks')).toEqual({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: '/home/hooks', AW_ORIG_HOOKS: '/work/.git/hooks' })
  })

  it('adds to configuration the person already put in the environment instead of replacing it', () => {
    expect(gitEnv({ GIT_CONFIG_COUNT: '2' }, '/h', '/o')).toMatchObject({ GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_2: 'core.hooksPath', GIT_CONFIG_VALUE_2: '/h' })
  })
})

describe('finding the repository\'s own hooks', () => {
  it('is the hooks folder of the repository, of a linked worktree\'s main repository, and the folder core.hooksPath names (relative to the work tree, or absolute)', async () => {
    const { work, root } = await repo()
    expect(await originalHooks(work)).toBe(join(work, '.git', 'hooks'))
    await run(work, {}, 'worktree', 'add', '-q', join(root, 'linked'), '-b', 'x')
    expect(await originalHooks(join(root, 'linked'))).toBe(join(work, '.git', 'hooks'))
    await run(work, {}, 'config', 'core.hooksPath', '.husky/_')
    expect(await originalHooks(work)).toBe(join(work, '.husky', '_'))
    await run(work, {}, 'config', 'core.hooksPath', '/somewhere/hooks')
    expect(await originalHooks(work)).toBe('/somewhere/hooks')
  })

  it('is nothing in a folder that is not a repository', async () => {
    expect(await originalHooks(tmp())).toBe('')
  })
})

describe('a commit with the office\'s hooks in place', () => {
  it('goes ahead when the office says nothing holds it, and tells the office where it was made', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({})
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    const r = await run(work, agentEnv(hooks, office.url), 'commit', '-qm', 'b')
    expect(r.ok).toBe(true)
    expect((await run(work, {}, 'log', '--format=%s')).out).toContain('b')
    const asked = office.seen.filter((x) => x.url === '/hook/git-commit')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ auth: 'Bearer tok-1' })
    expect(JSON.parse(asked[0]!.body!)).toEqual({ cwd: work })
  })

  it('is refused with the office\'s words when it says the commit is held, and nothing is committed', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({ block: 'Not yet: your plan is waiting for the person to approve it.' })
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    const r = await run(work, agentEnv(hooks, office.url), 'commit', '-qm', 'b')
    expect(r.ok).toBe(false)
    expect(r.out).toContain('Agent World: this commit is held. Not yet: your plan is waiting for the person to approve it.')
    expect((await run(work, {}, 'log', '--format=%s')).out.trim()).toBe('init')
  })

  it('goes ahead when the office cannot be reached, and when the person commits from their own terminal with no office variables', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, agentEnv(hooks, 'http://127.0.0.1:9/mcp'), 'commit', '-qm', 'b')).ok).toBe(true)
    writeFileSync(join(work, 'c.txt'), 'c\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, gitEnv({}, hooks, ''), 'commit', '-qm', 'c')).ok).toBe(true)
  })

  it('still runs the repository\'s own pre-commit hook, and its refusal still counts', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const own = join(work, '.git', 'hooks')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'pre-commit'), '#!/bin/sh\necho "own hook ran" >> "$(git rev-parse --show-toplevel)/own.log"\nexit ${OWN_EXIT:-0}\n')
    chmodSync(join(own, 'pre-commit'), 0o755)
    const office = await stub({})
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, agentEnv(hooks, office.url, own), 'commit', '-qm', 'b')).ok).toBe(true)
    expect(readFileSync(join(work, 'own.log'), 'utf8')).toContain('own hook ran')
    writeFileSync(join(work, 'c.txt'), 'c\n')
    await run(work, {}, 'add', 'c.txt')
    const refused = await run(work, { ...agentEnv(hooks, office.url, own), OWN_EXIT: '1' }, 'commit', '-qm', 'c')
    expect(refused.ok).toBe(false)
  })

  it('leaves the repository\'s other hooks working too, with what git passes them', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const own = join(work, '.git', 'hooks')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'commit-msg'), '#!/bin/sh\ngrep -q "ticket-" "$1" || { echo "needs a ticket" >&2; exit 1; }\n')
    chmodSync(join(own, 'commit-msg'), 0o755)
    const office = await stub({})
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    const env = agentEnv(hooks, office.url, own)
    expect((await run(work, env, 'commit', '-qm', 'no ticket here')).out).toContain('needs a ticket')
    expect((await run(work, env, 'commit', '-qm', 'ticket-1 b')).ok).toBe(true)
  })

  it('wins over a core.hooksPath the repository sets itself, and runs that folder\'s hook (a husky-style setup)', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    mkdirSync(join(work, '.husky', '_'), { recursive: true })
    writeFileSync(join(work, '.husky', '_', 'pre-commit'), '#!/bin/sh\necho husky >> "$(git rev-parse --show-toplevel)/husky.log"\n')
    chmodSync(join(work, '.husky', '_', 'pre-commit'), 0o755)
    await run(work, {}, 'config', 'core.hooksPath', '.husky/_')
    const office = await stub({ block: 'Not yet.' })
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    const orig = await originalHooks(work)
    expect((await run(work, agentEnv(hooks, office.url, orig), 'commit', '-qm', 'b')).ok).toBe(false)
    expect(existsSync(join(work, 'husky.log'))).toBe(false)
  })

  it('has a hook for every kind git has, so none of the repository\'s is lost', () => {
    const hooks = join(tmp(), 'hooks')
    writeGitHooks(hooks)
    for (const name of HOOK_NAMES) expect(existsSync(join(hooks, name)), name).toBe(true)
    expect(HOOK_NAMES).toEqual(expect.arrayContaining(['pre-commit', 'commit-msg', 'pre-push', 'post-commit', 'prepare-commit-msg']))
  })
})

describe('the first commit of a repository that has none yet', () => {
  it('is let through with the office\'s hooks in place, and the branch is the one git named, though nothing is on it', async () => {
    const root = tmp()
    const work = join(root, 'work')
    mkdirSync(work)
    await run(work, {}, 'init', '-q', '-b', 'main')
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({})
    expect(currentBranch(work)).toBe('main')
    expect(branchHead(work, 'main')).toBeNull()
    writeFileSync(join(work, 'a.txt'), 'a\n')
    await run(work, {}, 'add', '-A')
    const r = await run(work, agentEnv(hooks, office.url), 'commit', '-qm', 'first')
    expect(r.ok).toBe(true)
    expect(office.seen.filter((x) => x.url === '/hook/git-commit')).toHaveLength(1)
    expect(branchHead(work, 'main')).toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('a branch update with the office\'s hooks in place', () => {
  it('is refused even when the commit skips its hooks (--no-verify), because git asks the office before it moves a branch', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({}, { block: 'Not yet: your plan is waiting for the person to approve it.' })
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    const r = await run(work, agentEnv(hooks, office.url), 'commit', '--no-verify', '-qm', 'b')
    expect(r.ok).toBe(false)
    expect(r.out).toContain('Agent World: this change to a branch is held. Not yet: your plan is waiting for the person to approve it.')
    expect((await run(work, {}, 'log', '--format=%s')).out.trim()).toBe('init')
    const asked = office.seen.find((x) => x.url === '/hook/git-ref')!
    expect(JSON.parse(asked.body!)).toEqual({ cwd: work, refs: ['refs/heads/main'] })
  })

  it('is let through when the office says nothing holds it, and the office is asked once for a commit, not for each step git takes', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({}, {})
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, agentEnv(hooks, office.url), 'commit', '--no-verify', '-qm', 'b')).ok).toBe(true)
    expect(office.seen.filter((x) => x.url === '/hook/git-ref')).toHaveLength(1)
  })

  it('is not asked about when nothing touches a branch (a tag, a stash), and goes ahead when the office cannot be reached', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const office = await stub({}, { block: 'Not yet.' })
    expect((await run(work, agentEnv(hooks, office.url), 'tag', 'v1')).ok).toBe(true)
    expect(office.seen.filter((x) => x.url === '/hook/git-ref')).toHaveLength(0)
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, agentEnv(hooks, 'http://127.0.0.1:9/mcp'), 'commit', '--no-verify', '-qm', 'b')).ok).toBe(true)
  })

  it('still runs the repository\'s own reference-transaction hook with what git sends it', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    const own = join(work, '.git', 'hooks')
    mkdirSync(own, { recursive: true })
    writeFileSync(join(own, 'reference-transaction'), '#!/bin/sh\ncat >> "$(git rev-parse --show-toplevel)/refs-seen.log"\n')
    chmodSync(join(own, 'reference-transaction'), 0o755)
    const office = await stub({}, {})
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', '-A')
    expect((await run(work, agentEnv(hooks, office.url, own), 'commit', '-qm', 'b')).ok).toBe(true)
    expect(readFileSync(join(work, 'refs-seen.log'), 'utf8')).toContain('refs/heads/main')
  })
})

describe('the branch an agent working in the folder itself is on', () => {
  it('is the branch checked out there, and nothing for a detached head or a folder that is not a repository', async () => {
    const { work } = await repo()
    expect(currentBranch(work)).toBe('main')
    await run(work, {}, 'checkout', '-q', '-b', 'feature/x')
    expect(currentBranch(work)).toBe('feature/x')
    await run(work, {}, 'checkout', '-q', '--detach')
    expect(currentBranch(work)).toBeNull()
    expect(currentBranch(tmp())).toBeNull()
  })
})

describe('a merge into the base branch with the office\'s hooks in place', () => {
  const feature = async (work: string) => {
    await run(work, {}, 'checkout', '-q', '-b', 'feat')
    writeFileSync(join(work, 'f.txt'), 'f\n')
    await run(work, {}, 'add', '-A')
    await run(work, {}, 'commit', '-qm', 'feat')
    await run(work, {}, 'checkout', '-q', 'main')
  }
  it('is refused with the office\'s words, whatever way git merges (a fast-forward, a merge commit, update-ref), and main does not move', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    await feature(work)
    const office = await stub({}, { block: 'Not yet: 1 audit finding has not been seen.' })
    const env = agentEnv(hooks, office.url)
    for (const args of [['merge', '--ff-only', 'feat'], ['merge', '--no-ff', '-m', 'm', 'feat'], ['update-ref', 'refs/heads/main', 'feat']]) {
      const r = await run(work, env, ...args)
      expect(r.ok).toBe(false)
      expect(r.out).toContain('Agent World: this change to a branch is held. Not yet: 1 audit finding has not been seen.')
    }
    expect((await run(work, {}, 'log', '--format=%s', 'main')).out.trim()).toBe('init')
    expect(office.seen.filter((x) => x.url === '/hook/git-landed')).toHaveLength(0)
  })

  it('tells the office once the branch has moved, with which, so a landing is recorded however it came about; and not when it was held', async () => {
    const { work, root } = await repo()
    const hooks = join(root, 'hooks')
    writeGitHooks(hooks)
    await feature(work)
    const office = await stub({}, {})
    expect((await run(work, agentEnv(hooks, office.url), 'merge', '--ff-only', 'feat')).ok).toBe(true)
    const told = office.seen.filter((x) => x.url === '/hook/git-landed')
    expect(told).toHaveLength(1)
    expect(JSON.parse(told[0]!.body!)).toEqual({ cwd: work, refs: ['refs/heads/main'] })
    expect(told[0]!.auth).toBe('Bearer tok-1')
  })
})

describe('where a branch stands', () => {
  it('is the commit it points at, from any folder of the repository, and nothing for a branch that is not there or a folder that is not a repository', async () => {
    const { work, root } = await repo()
    const sha = (await run(work, {}, 'rev-parse', 'main')).out.trim()
    expect(branchHead(work, 'main')).toBe(sha)
    expect(branchHead(work, 'nope')).toBeNull()
    expect(branchHead(root, 'main')).toBeNull()
  })
})

describe('whether an update moves the base branch', () => {
  it('is yes for the base branch among the references, and no for any other, or when the agent has no base', () => {
    expect(movesBase('main', ['refs/heads/main'])).toBe(true)
    expect(movesBase('main', ['refs/heads/aw/ada', 'refs/heads/main'])).toBe(true)
    expect(movesBase('main', ['refs/heads/aw/ada', 'refs/heads/main-2', 'refs/tags/main'])).toBe(false)
    expect(movesBase(null, ['refs/heads/main'])).toBe(false)
  })
})

describe('which branch an update holds', () => {
  it('holds the agent\'s own branch and no other, and nothing for an agent working in the folder itself', () => {
    expect(holdsBranch('aw/ada', ['refs/heads/aw/ada'])).toBe(true)
    expect(holdsBranch('aw/ada', ['refs/heads/main', 'refs/heads/aw/ada'])).toBe(true)
    expect(holdsBranch('aw/ada', ['refs/heads/main', 'refs/heads/aw/ada-2', 'refs/tags/aw/ada'])).toBe(false)
    expect(holdsBranch(null, ['refs/heads/main'])).toBe(false)
  })
})

describe('the files a commit would hold', () => {
  it('are the staged paths from the work tree\'s root, whichever folder git is asked from', async () => {
    const { work } = await repo()
    mkdirSync(join(work, 'src'))
    writeFileSync(join(work, 'src', 'a.ts'), 'x\n')
    writeFileSync(join(work, 'b.txt'), 'b\n')
    await run(work, {}, 'add', 'src/a.ts')
    expect(stagedFiles(join(work, 'src'))).toEqual(['src/a.ts'])
    expect(stagedFiles(tmp())).toEqual([])
  })
})

describe('whether a commit was made in the agent\'s own work tree', () => {
  it('is yes for the folder and what is under it, and no for anywhere else, a sibling that shares a name prefix, or a folder that is not there', async () => {
    const { work, root } = await repo()
    mkdirSync(join(work, 'src'))
    mkdirSync(join(root, 'work-other'))
    expect([isInside(work, work), isInside(work, join(work, 'src'))]).toEqual([true, true])
    expect([isInside(work, join(root, 'work-other')), isInside(work, root), isInside(work, join(root, 'gone'))]).toEqual([false, false, false])
  })
})

describe('what the person\'s hold says to the agent', () => {
  it('has no quote, backslash or line break, so the hook can read it back from JSON with sed', () => {
    expect(blockText('Not "yet": see C:\\x\nplease')).toBe("Not 'yet': see C:/x please")
  })
})
