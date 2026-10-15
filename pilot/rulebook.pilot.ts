import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'
import type { RuleStrength } from '../src/shared/library'

/**
 * Does a real Claude agent use a playbook rule when its work needs it, and leave it alone when it does not, at each strength?
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/rulebook.pilot.ts      (PILOT_RUNS per case, default 3; PILOT_MAX_USD cap, default 2)
 * Nothing reads the message: the agent gets the rulebook and decides. The prompts never mention the rule or the library.
 * The rule asks for a phrase the model cannot guess, so a file that has it proves the rule was read and followed.
 */
const ON = !!process.env.PILOT
const RUNS = Number(process.env.PILOT_RUNS ?? 3)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 2)
const PHRASE = 'HOUSE-CHECKED-ZX9'
const RULE = `House rule for functions: every function you add or change gets a comment on the line above it that starts with exactly ${PHRASE}.`
const REPORT = 'pilot-rulebook-report.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

const CASES = {
  // The rule applies: a function is added.
  needed: { prompt: 'Add a function `double(n)` that returns n times two to util.js, with a one-line test in util.test.js.', file: 'util.js', when: 'adding or changing a function in this codebase', rule: RULE },
  // The rule does not apply: only a question is asked.
  question: { prompt: 'What does util.js in this repo do? Answer in one sentence and change nothing.', file: 'util.js', when: 'adding or changing a function in this codebase', rule: RULE },
  // A vaguer "when", and work that is only loosely about it: looking things up and writing down what was found.
  vague: { prompt: 'Find out the default ports of PostgreSQL and Redis and write them to NOTES.md, one line each.', file: 'NOTES.md', when: 'investigating something unfamiliar', rule: `House rule for research: whatever you write down from looking something up must end with a line that is exactly ${PHRASE}.` },
  // The same rule and task, with a "when" that names the work being done instead of how the agent feels about it.
  concrete: { prompt: 'Find out the default ports of PostgreSQL and Redis and write them to NOTES.md, one line each.', file: 'NOTES.md', when: 'writing facts you looked up into a notes, report or summary file', rule: `House rule for research: whatever you write down from looking something up must end with a line that is exactly ${PHRASE}.` }
} as const

describe.skipIf(!ON)('rulebook pilot with a real agent', () => {
  let dir: string
  let svc: ReturnType<typeof createLibraryService>
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  let hooks: Awaited<ReturnType<typeof startHookServer>>
  let mcpFile = ''
  let settingsFile = ''
  let spent = 0

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aw-rbpilot-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'pilot' ? { id, name: 'pilot', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'pilot' })
    await svc.library.save({ kind: 'skill', name: 'house-functions', description: 'House rule for functions.', body: RULE })
    await svc.library.save({ kind: 'skill', name: 'house-research', description: 'House rule for research notes.', body: CASES.vague.rule })
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
      reminderFor: (id, prompt) => svc.remind(id, prompt) || null,
      onToolUse: (id, tool, input) => { if (tool === 'Skill' && typeof input.skill === 'string') svc.record(id, input.skill.replace(/^[^:]+:/, ''), 'skill') }
    })
    settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
    writeFileSync(REPORT, '')
  })
  afterAll(() => (mcp?.close(), hooks?.close()))

  const run = async (strength: RuleStrength, kind: keyof typeof CASES, n: number) => {
    const cwd = join(dir, `${strength}-${kind}-${n}`)
    mkdirSync(cwd, { recursive: true })
    writeFileSync(join(cwd, 'util.js'), 'exports.triple = (n) => n * 3\n')
    writeFileSync(join(cwd, 'util.test.js'), "const { triple } = require('./util')\nconsole.assert(triple(2) === 6)\n")
    svc.playbooks.write({ workspace: 'pilot' }, [{ id: kind === 'vague' || kind === 'concrete' ? 'house-research' : 'house-functions', mode: 'on-demand', when: CASES[kind].when, strength }])
    const t0 = Date.now()
    const core = svc.prepare('pilot', true, true).core
    const tools = ['--allowedTools', 'Bash', 'Read', 'Edit', 'Write', 'mcp__agent-world__library_index', 'mcp__agent-world__library_get', 'mcp__agent-world__library_search', 'mcp__agent-world__library_skip']
    const out = await sh('claude', ['-p', CASES[kind].prompt, '--model', 'haiku', '--output-format', 'json', '--max-turns', '12', '--append-system-prompt', core, '--mcp-config', mcpFile, '--settings', settingsFile, ...tools], { env: agentEnv(process.env), cwd })
    const j = JSON.parse(out) as { total_cost_usd?: number }
    spent += j.total_cost_usd ?? 0
    const uses = svc.usesOf('pilot').filter((u) => u.t >= t0)
    const shown = uses.some((u) => u.how === 'triggered')
    const read = uses.some((u) => u.how === 'fetched' || u.how === 'skill')
    const skipped = uses.find((u) => u.how === 'skipped')
    let code = ''
    try { code = readFileSync(join(cwd, CASES[kind].file), 'utf8') } catch { /* no file */ }
    const followed = code.includes(PHRASE)
    appendFileSync(REPORT, `[${strength} ${kind} #${n}] shown=${shown} read=${read} skipped=${skipped ? JSON.stringify(skipped.reason) : 'no'} followed=${followed} $${(j.total_cost_usd ?? 0).toFixed(3)}\n`)
    return { strength, kind, shown, read, followed }
  }

  it('measures how often a real agent reads a rule it needs, and one it does not, at each strength', async () => {
    const seen: Awaited<ReturnType<typeof run>>[] = []
    for (const strength of ['soft', 'medium', 'hard'] as const) for (const kind of (process.env.PILOT_CASES?.split(',') ?? ['needed', 'question']) as (keyof typeof CASES)[]) for (let n = 1; n <= RUNS; n++) {
      if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached; stopping.`)
      seen.push(await run(strength, kind, n))
    }
    const rate = (f: (s: (typeof seen)[number]) => boolean, strength: RuleStrength, kind: keyof typeof CASES) => {
      const rows = seen.filter((s) => s.strength === strength && s.kind === kind)
      return `${rows.filter(f).length}/${rows.length}`
    }
    const kinds = [...new Set(seen.map((s) => s.kind))]
    appendFileSync(REPORT, `\nread / followed per case\n${(['soft', 'medium', 'hard'] as const).map((s) => `${s.padEnd(8)}  ${kinds.map((k) => `${k}: ${rate((r) => r.read, s, k)} / ${rate((r) => r.followed, s, k)}`).join('    ')}`).join('\n')}\n\nSpent $${spent.toFixed(2)}\n`)
    // The rulebook line is sent for medium and hard, and never for soft.
    expect(seen.filter((s) => s.strength !== 'soft').every((s) => s.shown)).toBe(true)
    expect(seen.filter((s) => s.strength === 'soft').some((s) => s.shown)).toBe(false)
  })
})
