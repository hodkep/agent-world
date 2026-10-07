import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, relative, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { importCandidates, scanSources } from '../src/main/library/sources'
import { UseLog } from '../src/main/library/uses'
import { agyLibraryHook } from '../src/main/providers/agy/libraryHook'

/**
 * The same question as scale.pilot.ts, for agy, through the real plugin (agy plugin aw-library must be installed: connect agy in Settings, or `agy plugin install <the plugin folder>`).
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/agy.pilot.ts      (writes pilot-agy-report.txt)
 * P: the plugin is silent (no token in the environment) · Q: the plugin points each message at the library. "Used" is the log's: agy read the skill's file.
 * PILOT_RUNS tasks per variant (default 8). PILOT_SET=q skips the silent run P; PILOT_SET=decoys runs only the keyword-bait questions through Q (does the agent decide, or read whatever is pointed at?).
 */
const ON = !!process.env.PILOT
const RUNS = Number(process.env.PILOT_RUNS ?? 8)
const REPORT = process.env.PILOT_REPORT ?? 'pilot-agy-report.txt'
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
  ['Check our government portal against GIGW 3.0.', /gigw/]
]
// Keyword bait: the matcher points at a skill, but the question needs none. Reading it is the mistake.
const DECOYS = [
  'What does git rebase do, in two sentences?',
  'Why would a lamp post be drawn behind a car in a canvas game? One sentence.',
  'What does TDD stand for? One line.',
  'What is a PRD? One sentence.',
  'What is a pull request review for? One sentence.'
]
const NEGATIVES = ['What is the capital of France?', 'Explain what a mutex is in one sentence.', 'Is 17 prime? Answer briefly.']
const sh = (args: string[], env: NodeJS.ProcessEnv, cwd: string) =>
  new Promise<string>((resolve, reject) => execFile('agy', args, { env, cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))
const out = (s: string) => appendFileSync(REPORT, s + '\n')

describe.skipIf(!ON)('agy at scale, through the plugin', () => {
  let dir = ''
  let svc: ReturnType<typeof createLibraryService>
  let ids: string[] = []
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  const TOKEN = 'agy-scale-token'

  beforeAll(async () => {
    writeFileSync(REPORT, '')
    dir = mkdtempSync(join(tmpdir(), 'aw-agyscale-'))
    mkdirSync(join(dir, 'work'))
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'scale' ? { id, name: 'scale', repoPath: join(dir, 'work'), provider: 'agy' } : undefined), workspaceKey: () => 'scale' })
    await importCandidates(svc.library, await scanSources({ home: homedir() }))
    ids = (await svc.library.list()).filter((i) => i.kind === 'skill').map((i) => i.id)
    svc.playbooks.write({ workspace: 'scale' }, ids.map((id) => ({ id, mode: 'on-demand' as const, when: '', strength: 'soft' as const })))
    out(`Skills in the library: ${ids.length}`)
    mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'scale' : null),
      listAgents: () => [],
      send: () => 'queued',
      remember: () => undefined,
      recall: () => [],
      hook: (id, event, payload) =>
        agyLibraryHook(event, payload, {
          remind: (p) => {
            if (process.env.PILOT_DEBUG) appendFileSync(`${REPORT}.seen`, JSON.stringify(p.slice(0, 600)) + '\n')
            return svc.remind(id, p)
          },
          used: (path) => {
            const m = relative(join(dir, 'library', 'skills'), path).split(sep)
            if (m[0] && m[0] !== '..' && !isAbsolute(m[0])) svc.record(id, m[0], 'read')
          }
        })
    })
  })
  afterAll(() => mcp?.close())

  interface Run { variant: string; target: boolean; used: boolean; usedAny: boolean; triggered: boolean; tokens: number }
  const runs: Run[] = []
  const agy = async (variant: string, prompt: string, want: RegExp | null) => {
    svc.prepare('scale', false, false)
    const since = Date.now()
    const env = { ...process.env, ...(variant === 'Q' ? { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: TOKEN } : {}) }
    const raw = await sh(['-p', prompt, '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--add-dir', join(dir, 'library')], env, join(dir, 'work'))
    const j = JSON.parse(raw) as { usage?: { total_tokens?: number } }
    await new Promise((r) => setTimeout(r, 500))
    const all = new UseLog(join(dir, 'library', 'uses.jsonl')).all().filter((x) => x.t >= since)
    const usedIds = all.filter((x) => x.how === 'read' || x.how === 'fetched').map((x) => x.id)
    runs.push({ variant, target: !!want, used: !!(want && usedIds.some((id) => want.test(id))), usedAny: usedIds.length > 0, triggered: all.some((x) => x.how === 'triggered'), tokens: j.usage?.total_tokens ?? 0 })
    out(`[${variant}] ${want ? (runs.at(-1)!.used ? 'used ' : 'MISS ') : runs.at(-1)!.triggered ? 'decoy' : 'neg  '} ${prompt.slice(0, 55).padEnd(55)} pointed: ${runs.at(-1)!.triggered ? 'yes' : 'no'}  read: ${[...new Set(usedIds)].join(', ') || '-'}  tokens ${runs.at(-1)!.tokens}`)
  }

  it('real agy among every skill', async () => {
    const positives = TASKS.filter(([, want]) => ids.some((id) => want.test(id))).slice(0, RUNS)
    const decoysOnly = process.env.PILOT_SET === 'decoys'
    for (const variant of decoysOnly || process.env.PILOT_SET === 'q' ? ['Q'] : ['P', 'Q']) {
      if (!decoysOnly) for (const [prompt, want] of positives) await agy(variant, prompt, want)
      if (variant === 'Q') for (const prompt of [...(decoysOnly ? [] : NEGATIVES), ...DECOYS]) await agy(variant, prompt, null)
    }
    out('\nRESULTS')
    for (const v of ['P', 'Q']) {
      const pos = runs.filter((r) => r.variant === v && r.target)
      const neg = runs.filter((r) => r.variant === v && !r.target)
      const avg = (rs: Run[]) => Math.round(rs.reduce((n, r) => n + r.tokens, 0) / Math.max(1, rs.length))
      out(`${v}  right skill read ${pos.filter((r) => r.used).length}/${pos.length}  read something on a task about none ${neg.filter((r) => r.usedAny).length}/${neg.length}  tokens/run ${avg(runs.filter((r) => r.variant === v))}  (when it read: ${avg(pos.filter((r) => r.used))}, when not: ${avg(pos.filter((r) => !r.used))})`)
    }
    const s = svc.stats()
    out(`Log: triggered ${Object.values(s.items).reduce((n, i) => n + i.triggered, 0)}, answered ${Object.values(s.items).reduce((n, i) => n + i.answered, 0)}, used ${Object.values(s.items).reduce((n, i) => n + i.used, 0)}`)
    expect(runs.length).toBeGreaterThan(0)
  })
})
