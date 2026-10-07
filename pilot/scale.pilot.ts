import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, relative, sep, isAbsolute } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { importCandidates, scanSources } from '../src/main/library/sources'
import { matchItems } from '../src/main/library/match'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'

/**
 * The library at the size it really is: every skill found on this machine, all on demand.
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/scale.pilot.ts      (writes pilot-scale-report.txt)
 * Part 1 is free: does the matcher point a prompt at the right skill among all of them, and stay quiet for prompts about none?
 * Part 2 uses real Claude (PILOT_MODEL, default haiku; PILOT_REPORT names the report file): P agent left to itself (catalog file + tools) · Q P + the matched line each turn · R every skill loaded natively + the matched line.
 * "Used" is the log's own record (fetched through the tools, the Skill tool, or a Read of the skill's file). PILOT_RUNS = tasks per variant (default 8), PILOT_MAX_USD (default 2), PILOT_VARIANTS (default PQR), PILOT_DECOYS=1 adds five keyword-bait questions to each pointed variant.
 */
const ON = !!process.env.PILOT
const RUNS = Number(process.env.PILOT_RUNS ?? 8)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 2)
const REPORT = process.env.PILOT_REPORT ?? 'pilot-scale-report.txt'
const MODEL = process.env.PILOT_MODEL ?? 'haiku'

// A task and which skills would be right for it (any one; matched against the library's ids).
const TASKS: [string, RegExp][] = [
  ['Design the database schema for an orders system with customers, products and invoices, including indexes.', /database-schema/],
  ['Write a software requirements specification for the new student portal.', /srs/],
  ['Add a discount feature to the cart; build it test first, red green refactor.', /^tdd$|test-driven/],
  ['A test fails once in every twenty runs and nobody knows why. Help me find the cause.', /diagnosing/],
  ['My rebase stopped with conflicts in package.json and two source files. Sort it out.', /merge-conflict/],
  ['Review everything that changed on this branch since main against our standards.', /code-review/],
  ['Write a PRD for the new onboarding flow.', /prd/],
  ['Break this spec into small tickets that say what blocks what.', /to-tickets/],
  ['Summarise this conversation so another agent can pick it up tomorrow.', /handoff/],
  ['Turn this text into an infographic.', /infographic-creator/],
  ['Make a narrated explainer video out of my note on vector clocks.', /note-to-video/],
  ['Stress-test my migration plan: ask me the hard questions until it holds up.', /grill/],
  ['Where is this repo over-engineered? Scan the whole thing and rank what to delete.', /ponytail-audit/],
  ['Check our government portal against GIGW 3.0.', /gigw/],
  ['Write an interactive script that walks me through creating the CI secrets by hand.', /wizard/],
  ['Build a throwaway prototype so I can feel whether this state model works.', /prototype/],
  ['Triage the new issues that came in this week.', /triage/],
  ['Teach me how closures work in JavaScript.', /^teach$/]
]
const NEGATIVES = ['What is the capital of France?', 'Explain what a mutex is in one sentence.', 'Is 17 prime? Answer briefly.', 'Suggest a name for a TypeScript helper that debounces calls.', 'Translate "good morning" into Spanish.', 'What does git rebase do, in two sentences?', 'Why would a lamp post be drawn behind a car in a canvas game?']
// Keyword bait: the matcher points at a skill, but the question needs none. Used only with PILOT_DECOYS=1.
const DECOYS = ['What does git rebase do, in two sentences?', 'Why would a lamp post be drawn behind a car in a canvas game? One sentence.', 'What does TDD stand for? One line.', 'What is a PRD? One sentence.', 'What is a pull request review for? One sentence.']

const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))
const out = (s: string) => appendFileSync(REPORT, s + '\n')

describe.skipIf(!ON)('library at scale', () => {
  let dir = ''
  let svc: ReturnType<typeof createLibraryService>
  let ids: string[] = []
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  let hooks: Awaited<ReturnType<typeof startHookServer>>
  let mcpFile = ''
  let settingsFile = ''
  let core = ''
  let pluginDir = ''
  const TOKEN = 'scale-token'
  let nudge = true

  beforeAll(async () => {
    writeFileSync(REPORT, '')
    dir = mkdtempSync(join(tmpdir(), 'aw-scale-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'scale' ? { id, name: 'scale', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'scale' })
    // Read only: copies every skill found on this machine into a throwaway library.
    const found = await scanSources({ home: homedir() })
    const r = await importCandidates(svc.library, found)
    ids = (await svc.library.list()).filter((i) => i.kind === 'skill').map((i) => i.id)
    svc.playbooks.write({ workspace: 'scale' }, ids.map((id) => ({ id, mode: 'on-demand' as const, when: '', strength: 'soft' as const })))
    out(`Skills in the library: ${ids.length} (found ${found.length}, skipped ${r.skipped.length})`)
    const p = svc.prepare('scale', true)
    core = p.core
    pluginDir = p.pluginDir ?? ''
    mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'scale' : null),
      listAgents: () => [],
      send: () => 'queued',
      remember: () => undefined,
      recall: () => [],
      library: { index: (c) => svc.index(c), get: (c, id, f) => svc.get(c, id, f), search: (c, q) => svc.search(c, q) }
    })
    mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'scale' : null),
      permissionTimeoutMs: 5000,
      onEvent: () => undefined,
      onPermission: () => undefined,
      onPermissionSettled: () => undefined,
      onStatus: () => undefined,
      reminderFor: (id, prompt) => (nudge ? svc.remind(id, prompt) : (svc.remind(id, prompt), null)),
      onToolUse: (id, tool, input) => {
        if (tool === 'Skill' && typeof input.skill === 'string') svc.record(id, input.skill.replace(/^[^:]+:/, ''), 'skill')
        else if (tool === 'Read' && typeof input.file_path === 'string') {
          const m = relative(join(dir, 'library', 'skills'), input.file_path).split(sep)
          if (m[0] && m[0] !== '..' && !isAbsolute(m[0])) svc.record(id, m[0], 'read')
        }
      }
    })
    settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
  })
  afterAll(() => {
    mcp?.close()
    hooks?.close()
  })

  it('part 1: the matcher among every skill', async () => {
    const entries = (await svc.index('scale')).map((e) => ({ ...e }))
    let top1 = 0
    let top3 = 0
    let silent = 0
    // Only tasks whose skill exists on this machine can be matched.
    const have = TASKS.filter(([, want]) => entries.some((e) => want.test(e.id)))
    out(`Tasks with a skill here: ${have.length} of ${TASKS.length}`)
    for (const [prompt, want] of have) {
      const m = matchItems(prompt, entries, 3)
      const hit = (x: { id: string }) => want.test(x.id)
      if (m[0] && hit(m[0])) top1++
      if (m.some(hit)) top3++
      if (!m.length) silent++
      out(`  ${m.some(hit) ? 'hit ' : 'MISS'} ${prompt.slice(0, 60).padEnd(60)} -> ${m.map((x) => x.id).join(', ') || '(nothing)'}`)
    }
    let false1 = 0
    for (const prompt of NEGATIVES) {
      const m = matchItems(prompt, entries, 3)
      if (m.length) false1++
      out(`  ${m.length ? 'FALSE' : 'quiet'} ${prompt.slice(0, 60).padEnd(60)} -> ${m.map((x) => x.id).join(', ') || '(nothing)'}`)
    }
    out(`MATCHER over ${entries.length} skills: right one first ${top1}/${have.length}, among the top 3 ${top3}/${have.length}, no match at all ${silent}/${have.length}; pointed at something for a prompt about none: ${false1}/${NEGATIVES.length}\n`)
    expect(entries.length).toBeGreaterThan(0)
  })

  interface Run { variant: string; task: string; target: string | null; used: boolean; usedAny: boolean; triggered: boolean; tokens: number; usd: number }
  const runs: Run[] = []
  let spent = 0

  const claude = async (variant: string, prompt: string, want: RegExp | null) => {
    // A fresh turn count for each run, and only this run's log lines count.
    svc.prepare('scale', true)
    const since = Date.now()
    nudge = variant !== 'P'
    const base = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '6', '--append-system-prompt', core, '--mcp-config', mcpFile, '--allowedTools', 'mcp__agent-world__library_index', 'mcp__agent-world__library_get', 'mcp__agent-world__library_search', '--add-dir', join(dir, 'library'), '--settings', settingsFile]
    if (variant === 'R') base.push('--plugin-dir', pluginDir)
    const raw = await sh('claude', base, { env: agentEnv(process.env), cwd: join(dir, 'work') })
    const j = JSON.parse(raw) as { total_cost_usd?: number; usage?: Record<string, number> }
    const u = j.usage ?? {}
    const tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)
    const usd = j.total_cost_usd ?? 0
    spent += usd
    // The stats come from the service's own log; a short wait lets the last hook land.
    await new Promise((r) => setTimeout(r, 500))
    const uses = (await import('../src/main/library/uses')).UseLog
    const all = new uses(join(dir, 'library', 'uses.jsonl')).all().filter((x) => x.t >= since)
    const usedIds = all.filter((x) => x.how === 'fetched' || x.how === 'skill' || x.how === 'read').map((x) => x.id)
    const target = want ? ids.find((id) => want.test(id)) ?? null : null
    runs.push({ variant, task: prompt.slice(0, 50), target, used: !!(want && usedIds.some((id) => want.test(id))), usedAny: usedIds.length > 0, triggered: all.some((x) => x.how === 'triggered'), tokens, usd })
    out(`[${variant}] ${want ? (runs.at(-1)!.used ? 'used ' : 'MISS ') : 'neg  '} ${prompt.slice(0, 55).padEnd(55)} used: ${[...new Set(usedIds)].join(', ') || '-'}  tokens ${tokens}`)
  }

  it('part 2: real Claude among every skill', async () => {
    const positives = TASKS.filter(([, want]) => ids.some((id) => want.test(id))).slice(0, RUNS)
    out(`Tasks that have a matching skill here: ${positives.length} of ${TASKS.length}`)
    for (const variant of (process.env.PILOT_VARIANTS ?? 'PQR').split('')) {
      for (const [prompt, want] of positives) {
        if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached; stopping.`)
        await claude(variant, prompt, want)
      }
      if (variant !== 'P') for (const prompt of [...NEGATIVES.slice(0, 3), ...(process.env.PILOT_DECOYS ? DECOYS : [])]) await claude(variant, prompt, null)
    }
    out('\nRESULTS')
    for (const v of [...new Set(runs.map((r) => r.variant))]) {
      const pos = runs.filter((r) => r.variant === v && r.target !== null)
      const neg = runs.filter((r) => r.variant === v && r.target === null)
      const avg = (rs: Run[], f: (r: Run) => number) => Math.round(rs.reduce((n, r) => n + f(r), 0) / Math.max(1, rs.length))
      out(`${v}  right skill used ${pos.filter((r) => r.used).length}/${pos.length}  any skill used on a task about none ${neg.filter((r) => r.usedAny).length}/${neg.length}  tokens/run ${avg(runs.filter((r) => r.variant === v), (r) => r.tokens)}  $ ${(runs.filter((r) => r.variant === v).reduce((n, r) => n + r.usd, 0)).toFixed(3)}`)
    }
    out(`Spent about $${spent.toFixed(3)}.`)
    const s = svc.stats()
    out(`Log: triggered ${Object.values(s.items).reduce((n, i) => n + i.triggered, 0)}, answered ${Object.values(s.items).reduce((n, i) => n + i.answered, 0)}, used ${Object.values(s.items).reduce((n, i) => n + i.used, 0)}`)
  })
})
