import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'

/**
 * Does a real Claude agent, in the middle of a task, follow a rule the playbook fires on a situation (a merge conflict)?
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/situations.pilot.ts      (PILOT_RUNS per case, default 3; PILOT_MAX_USD cap, default 1.5)
 * The prompt never mentions the skill or the library. The skill asks for a phrase the model cannot guess in the commit message, so a commit that has it proves the skill was read and followed.
 */
const ON = !!process.env.PILOT
const RUNS = Number(process.env.PILOT_RUNS ?? 3)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 1.5)
const PHRASE = 'CONFLICT-CHECKED-ZX9'
const SKILL = `When resolving a git merge conflict: keep the intent of both sides, run the project's checks, and end the commit message with the exact phrase ${PHRASE}.`
const REPORT = 'pilot-situations-report.txt'
const TOKEN = 'pilot-token'
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=p@p', '-c', 'user.name=p', ...a], { cwd, encoding: 'utf8' })
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

/** A repo where merging `feature` into `main` conflicts: `big` changes the same lines on both sides, `easy` only appends a different line to each. */
function repo(dir: string, kind: 'big' | 'easy') {
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  const base = kind === 'big' ? 'price = 10\ntax = 2\ntotal = price + tax\n' : 'one\ntwo\n'
  writeFileSync(join(dir, 'calc.txt'), base)
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'base')
  git(dir, 'checkout', '-qb', 'feature')
  writeFileSync(join(dir, 'calc.txt'), kind === 'big' ? 'price = 12\ntax = 3\ntotal = price + tax + shipping\n' : 'one\ntwo\nthree-from-feature\n')
  git(dir, 'commit', '-qam', 'feature change')
  git(dir, 'checkout', '-q', 'main')
  writeFileSync(join(dir, 'calc.txt'), kind === 'big' ? 'price = 11\ntax = 2\ntotal = price * tax\n' : 'one\ntwo\nthree-from-main\n')
  git(dir, 'commit', '-qam', 'main change')
}

describe.skipIf(!ON)('situations pilot with a real agent', () => {
  let dir: string
  let svc: ReturnType<typeof createLibraryService>
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  let hooks: Awaited<ReturnType<typeof startHookServer>>
  let mcpFile = ''
  let settingsFile = ''
  let work = ''
  let core = ''
  let spent = 0

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aw-sitpilot-'))
    work = join(dir, 'work')
    mkdirSync(work)
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'pilot' ? { id, name: 'pilot', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'pilot' })
    await svc.library.save({ kind: 'skill', name: 'resolving-merge-conflicts', description: 'Resolve a git merge conflict: keep both intents, run checks, sign the commit.', body: SKILL })
    svc.playbooks.write({ workspace: 'pilot' }, [{ id: 'resolving-merge-conflicts', mode: 'on-demand', when: 'a merge or rebase stopped with conflict markers', strength: 'medium', also: ['merge-conflict'] }])
    core = svc.prepare('pilot', true, true).core
    mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      listAgents: () => [], send: () => 'queued', remember: () => undefined, recall: () => [],
      library: { index: (c) => svc.index(c), get: (c, id, f) => svc.get(c, id, f), search: (c, q) => svc.search(c, q), skip: (c, id, r) => svc.skip(c, id, r) }
    })
    mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null), permissionTimeoutMs: 5000,
      onEvent: () => undefined, onPermission: () => undefined, onPermissionSettled: () => undefined, onStatus: () => undefined,
      onToolUse: (id, tool, input) => { if (tool === 'Skill' && typeof input.skill === 'string') svc.record(id, input.skill.replace(/^[^:]+:/, ''), 'skill') },
      situationFor: (id, tool, input, response) => svc.situation(id, tool, input, response) || null
    })
    settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
    writeFileSync(REPORT, `OPENING TEXT:\n${core}\n\n`)
  })
  afterAll(() => (mcp?.close(), hooks?.close()))

  const run = async (kind: 'big' | 'easy', n: number) => {
    const cwd = join(dir, `${kind}-${n}`)
    const t0 = Date.now()
    repo(cwd, kind)
    await svc.prepare('pilot', true, true)
    const tools = ['--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'mcp__agent-world__library_index', 'mcp__agent-world__library_get', 'mcp__agent-world__library_search', 'mcp__agent-world__library_skip']
    const prompt = 'Merge the branch feature into main in this repo and finish the merge, so main has both changes.'
    const out = await sh('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--max-turns', '14', '--append-system-prompt', core, '--mcp-config', mcpFile, '--settings', settingsFile, ...tools], { env: agentEnv(process.env), cwd })
    const j = JSON.parse(out) as { result?: string; total_cost_usd?: number }
    spent += j.total_cost_usd ?? 0
    const msg = git(cwd, 'log', '-1', '--format=%B').trim()
    const uses = svc.usesOf('pilot').filter((u) => u.t >= t0)
    const pointed = uses.some((u) => u.how === 'triggered' && u.because)
    const read = uses.some((u) => u.how === 'fetched' || u.how === 'skill')
    const skipped = uses.find((u) => u.how === 'skipped')
    appendFileSync(REPORT, `[${kind} #${n}] pointed=${pointed} read=${read} skipped=${skipped ? JSON.stringify(skipped.reason) : 'no'} followed=${msg.includes(PHRASE)} merged=${/Merge|feature/i.test(msg)} $${(j.total_cost_usd ?? 0).toFixed(3)}\n   order: ${uses.map((u) => `${u.how}${u.because ? '*' : ''}`).join(' > ')}\n   last commit: ${JSON.stringify(msg.slice(0, 120))}\n   said: ${JSON.stringify((j.result ?? '').slice(0, 160))}\n`)
    return { pointed, read, skipped: !!skipped, followed: msg.includes(PHRASE) }
  }

  it('points a real agent at the skill mid-run, and it reads or passes it over', async () => {
    const seen: Awaited<ReturnType<typeof run>>[] = []
    for (const kind of ['big', 'easy'] as const) for (let n = 1; n <= RUNS; n++) {
      if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached; stopping.`)
      seen.push(await run(kind, n))
    }
    appendFileSync(REPORT, `\nSpent $${spent.toFixed(2)}\n`)
    // The mechanism must fire for every real conflict; what the agent does with it is what the report is for.
    expect(seen.filter((s) => s.pointed).length).toBeGreaterThan(0)
  })
})
