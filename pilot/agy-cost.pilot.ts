import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { agyLibraryHook } from '../src/main/providers/agy/libraryHook'

/**
 * What does the line agy's plugin injects cost over a long conversation? Injected steps stay in the conversation, so each one is paid again on every later turn unless agy caches the prefix.
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/agy-cost.pilot.ts      (writes pilot-agy-cost-report.txt; the plugin aw-library must be installed)
 * The same ten prompts, each on a topic one library item covers, in two fresh conversations: S the plugin silent (no token in the environment), E the plugin pointing each one at its item.
 * That is the worst case (a line on every turn). The prompts say not to read files, so the difference is the injected line and what it makes agy do, not a skill being read.
 * PILOT_TURNS (default 10).
 */
const ON = !!process.env.PILOT
const TURNS = Number(process.env.PILOT_TURNS ?? 10)
const REPORT = 'pilot-agy-cost-report.txt'
const out = (s: string) => appendFileSync(REPORT, s + '\n')
const ITEMS: [string, string, string][] = [
  ['release-checklist', 'shipping a release to production', 'shipping a release to production'],
  ['refund-policy', 'issuing a refund or a credit to a customer', 'issuing a refund to a customer'],
  ['database-migrations', 'writing or reviewing a schema migration', 'writing a schema migration'],
  ['incident-response', 'a production outage or an alert that is firing', 'a production outage'],
  ['code-review', 'reviewing a pull request or a branch', 'reviewing a pull request'],
  ['api-design', 'designing a public HTTP endpoint', 'designing a public HTTP endpoint'],
  ['onboarding', 'a new teammate joining the team', 'a new teammate joining the team'],
  ['security-review', 'checking a change for vulnerabilities', 'checking a change for vulnerabilities'],
  ['perf-tuning', 'a slow page or a slow query', 'a slow query'],
  ['changelog', 'writing release notes', 'writing release notes']
]
const sh = (args: string[], env: NodeJS.ProcessEnv, cwd: string) =>
  new Promise<string>((resolve, reject) => execFile('agy', args, { env, cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, o) => (err && !o ? reject(err) : resolve(o))))

describe.skipIf(!ON)('what the plugin costs agy over a conversation', () => {
  let dir = ''
  let svc: ReturnType<typeof createLibraryService>
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  const TOKEN = 'agy-cost-token'

  beforeAll(async () => {
    writeFileSync(REPORT, '')
    dir = mkdtempSync(join(tmpdir(), 'aw-agycost-'))
    mkdirSync(join(dir, 'work'))
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'cost' ? { id, name: 'cost', repoPath: join(dir, 'work'), provider: 'agy' } : undefined), workspaceKey: () => 'cost' })
    for (const [name, when] of ITEMS) await svc.library.save({ kind: 'prompt', name, description: when, body: `${name}: follow the team's usual steps.` })
    svc.playbooks.write({ workspace: 'cost' }, ITEMS.map(([id, when]) => ({ id, mode: 'on-demand' as const, when, strength: 'soft' as const })))
    mcp = await startMcpServer({ agentForToken: (t) => (t === TOKEN ? 'cost' : null), listAgents: () => [], send: () => 'queued', remember: () => undefined, recall: () => [], hook: (id, event, payload) => agyLibraryHook(event, payload, { remind: (p) => svc.remind(id, p), used: () => undefined }) })
  })
  afterAll(() => mcp?.close())

  it('ten turns with the plugin silent, and ten with it pointing every time', async () => {
    const prompts = ITEMS.slice(0, TURNS).map(([, , topic]) => `Quick question about ${topic}: name one thing to watch for. Answer in one short sentence and do not read any files.`)
    const result: Record<string, { input: number; cache: number; total: number }[]> = {}
    for (const variant of ['S', 'E']) {
      svc.prepare('cost', false, false)
      const env = { ...process.env, ...(variant === 'E' ? { AW_MCP_URL: mcp.url, AW_AGENT_TOKEN: TOKEN } : {}) }
      let conv = ''
      result[variant] = []
      for (let i = 0; i < prompts.length; i++) {
        const args = ['-p', prompts[i]!, '--model', 'gemini-3.8-flash-low', '--output-format', 'json', '--add-dir', join(dir, 'library'), ...(conv ? ['--conversation', conv] : [])]
        const j = JSON.parse(await sh(args, env, join(dir, 'work')).catch((e) => `{"failed":"${String(e).slice(0, 80)}"}`)) as { conversation_id?: string; usage?: { input_tokens?: number; cache_read_tokens?: number; total_tokens?: number }; failed?: string }
        conv ||= j.conversation_id ?? ''
        const u = j.usage ?? {}
        result[variant]!.push({ input: u.input_tokens ?? 0, cache: u.cache_read_tokens ?? 0, total: u.total_tokens ?? 0 })
        out(`${variant} turn ${String(i + 1).padStart(2)}: input ${String(u.input_tokens ?? 0).padStart(7)}  cache_read ${String(u.cache_read_tokens ?? 0).padStart(7)}  total ${String(u.total_tokens ?? 0).padStart(7)}${j.failed ? '  ' + j.failed : ''}`)
      }
    }
    const sum = (v: string, f: (r: { input: number; cache: number; total: number }) => number) => result[v]!.reduce((n, r) => n + f(r), 0)
    const pct = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round((100 * (a - b)) / b)}%` : 'n/a')
    out('\nRESULTS')
    for (const v of ['S', 'E']) out(`${v}  input ${sum(v, (r) => r.input)}  cache_read ${sum(v, (r) => r.cache)}  total ${sum(v, (r) => r.total)}`)
    out(`With the plugin pointing every turn: total ${pct(sum('E', (r) => r.total), sum('S', (r) => r.total))}, input ${pct(sum('E', (r) => r.input), sum('S', (r) => r.input))} against silent.`)
    const last = (v: string) => result[v]!.at(-1)?.total ?? 0
    out(`Last turn: S ${last('S')}, E ${last('E')} (${pct(last('E'), last('S'))}).`)
    const s = svc.stats()
    out(`Log: ${Object.values(s.items).reduce((n, i) => n + i.triggered, 0)} items pointed at over ${prompts.length} messages (a message can point at up to three)`)
  })
})
