import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { matchItems } from '../src/main/library/match'
import { UseLog } from '../src/main/library/uses'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'

/**
 * One long real conversation: does the catalog come back at the 10th prompt and after a compaction, and can the agent use it?
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts pilot/session.pilot.ts      (writes pilot-session-report.txt)
 * The library holds a dozen on-demand items. Two probes are worded so the matcher does not point at the right item (the report says whether it did),
 * so a right answer (the item holds a fact the model cannot guess) comes from the catalog, or from the opening text's when-lines, and not from the per-prompt line.
 * PILOT_MODEL (default haiku), PILOT_MAX_USD (default 1.5).
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'haiku'
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 1.5)
const REPORT = 'pilot-session-report.txt'
const out = (s: string) => appendFileSync(REPORT, s + '\n')
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, o2) => (err && !o2 ? reject(err) : resolve(o2))))

const ITEMS: [string, string, string][] = [
  ['release-checklist', 'shipping a release to production', 'The release environment of this workspace is named ZEPHYR-7. When asked which environment to deploy to, answer ZEPHYR-7.'],
  ['refund-policy', 'issuing a refund or a credit to a customer', 'Refunds over 50 dollars need sign-off from the desk named OSPREY-3. When asked who approves a large refund, answer OSPREY-3.'],
  ['database-migrations', 'writing or reviewing a schema migration', 'Every migration here is checked by the tool named LANTERN-9 before it is merged.'],
  ['incident-response', 'a production outage or an alert that is firing', 'During an outage the war room is the channel named KESTREL-2.'],
  ['code-review', 'reviewing a pull request or a branch', 'Reviews here use the checklist named MAPLE-5.'],
  ['api-design', 'designing a public HTTP endpoint', 'Public endpoints must follow the style guide named COBALT-4.'],
  ['onboarding', 'a new teammate joining the team', 'New teammates get the starter pack named TULIP-8.'],
  ['security-review', 'checking a change for vulnerabilities', 'Security findings are filed in the tracker named FALCON-6.'],
  ['perf-tuning', 'a slow page or a slow query', 'Profiling here is done with the tool named GRANITE-1.'],
  ['data-retention', 'how long customer data may be kept', 'Customer data is kept for the period named WILLOW-12.'],
  ['changelog', 'writing release notes', 'Release notes use the template named JUNIPER-3.'],
  ['accessibility', 'checking a screen for accessibility', 'Accessibility checks use the audit named HERON-7.']
]
const NEUTRAL = ['What is the capital of France?', 'Explain what a mutex is in one sentence.', 'Give me three names for a cat.', 'Is 17 prime? Answer briefly.', 'Translate "good morning" into Spanish.', 'What does git rebase do, in two sentences?', 'Suggest a name for a TypeScript helper that debounces calls.', 'What is 12 times 12?', 'Name one use of a hash map.', 'Spell "necessary" backwards.']
// Worded so the matcher is unlikely to point at the right item.
const PROBES: { prompt: string; item: string; fact: string }[] = [
  { prompt: 'We are about to go live with the new build. Which environment name do I use? Check the library if it covers this.', item: 'release-checklist', fact: 'ZEPHYR-7' },
  { prompt: 'A customer was charged twice and wants the money back, a large amount. Who has to approve it? Check the library if it covers this.', item: 'refund-policy', fact: 'OSPREY-3' }
]
const CATALOG_MARK = 'Library items and when each applies'

describe.skipIf(!ON)('a long session', () => {
  let dir = ''
  let svc: ReturnType<typeof createLibraryService>
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  let hooks: Awaited<ReturnType<typeof startHookServer>>
  let mcpFile = ''
  let settingsFile = ''
  let core = ''
  const hookLog: { n: number; prompt: string; catalog: boolean; pointed: string[] }[] = []
  let compacted = 0
  const TOKEN = 'session-token'

  beforeAll(async () => {
    writeFileSync(REPORT, '')
    dir = mkdtempSync(join(tmpdir(), 'aw-session-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'sess' ? { id, name: 'sess', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'sess' })
    for (const [name, when, fact] of ITEMS) await svc.library.save({ kind: 'prompt', name, description: when, body: fact })
    svc.playbooks.write({ workspace: 'sess' }, ITEMS.map(([id, when]) => ({ id, mode: 'on-demand' as const, when, strength: 'soft' as const })))
    core = svc.prepare('sess', true, true).core
    mcp = await startMcpServer({ agentForToken: (t) => (t === TOKEN ? 'sess' : null), listAgents: () => [], send: () => 'queued', remember: () => undefined, recall: () => [], library: { index: (c) => svc.index(c), get: (c, id, f) => svc.get(c, id, f), search: (c, q) => svc.search(c, q) } })
    mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'sess' : null),
      permissionTimeoutMs: 5000,
      onEvent: () => undefined,
      onPermission: () => undefined,
      onPermissionSettled: () => undefined,
      onStatus: () => undefined,
      reminderFor: (id, prompt) => {
        const r = svc.remind(id, prompt)
        hookLog.push({ n: hookLog.length + 1, prompt: prompt.slice(0, 40), catalog: r.includes(CATALOG_MARK), pointed: [...r.matchAll(/matches ([\w-]+)/g)].map((m) => m[1]!) })
        return r || null
      },
      onCompact: (id) => (compacted++, svc.refresh(id)),
      onToolUse: () => undefined
    })
    settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
  })
  afterAll(() => {
    mcp?.close()
    hooks?.close()
  })

  it('runs 13 prompts and a compaction in one session', async () => {
    const entries = (await svc.index('sess')).map((e) => ({ ...e }))
    for (const p of PROBES) out(`matcher on probe "${p.prompt.slice(0, 50)}…": ${matchItems(p.prompt, entries, 3).map((m) => m.id).join(', ') || '(nothing)'}  (right item: ${p.item})`)
    const session = randomUUID()
    let first = true
    let spent = 0
    const log = new UseLog(join(dir, 'library', 'uses.jsonl'))
    const turn = async (label: string, prompt: string, fact?: string, item?: string) => {
      if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached; stopping.`)
      const since = Date.now()
      const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '5', '--append-system-prompt', core, '--mcp-config', mcpFile, '--allowedTools', 'mcp__agent-world__library_index', 'mcp__agent-world__library_get', 'mcp__agent-world__library_search', '--add-dir', join(dir, 'library'), '--settings', settingsFile, first ? '--session-id' : '--resume', session]
      first = false
      let text = ''
      let usd = 0
      let tokens = 0
      try {
        const j = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: join(dir, 'work') })) as { result?: string; total_cost_usd?: number; usage?: Record<string, number> }
        text = j.result ?? ''
        usd = j.total_cost_usd ?? 0
        const u = j.usage ?? {}
        tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)
      } catch (e) {
        text = `(failed: ${(e as Error).message.slice(0, 120)})`
      }
      // A resumed session reports its whole cost so far, so the spend is the largest figure, not their sum.
      spent = Math.max(spent, usd)
      await new Promise((r) => setTimeout(r, 400))
      const uses = log.all().filter((x) => x.t >= since && (x.how === 'fetched' || x.how === 'skill' || x.how === 'read')).map((x) => x.id)
      const h = hookLog.at(-1)
      out(`${label.padEnd(9)} catalog-in-hook ${h && h.n >= 1 && label !== 'compact' ? (h.catalog ? 'YES' : 'no ') : 'n/a'}  pointed ${(h?.pointed ?? []).join(',') || '-'}  read ${[...new Set(uses)].join(',') || '-'}  ${fact ? (text.includes(fact) ? `ANSWERED(${fact})` : `MISSED(${fact})`) : ''}  tokens ${tokens}  $${usd.toFixed(3)}  ${fact ? '' : text.slice(0, 40).replace(/\n/g, ' ')}`)
      void item
      return text
    }
    for (let i = 0; i < NEUTRAL.length; i++) await turn(`turn ${i + 1}`, NEUTRAL[i]!)
    await turn('turn 11', PROBES[0]!.prompt, PROBES[0]!.fact, PROBES[0]!.item)
    const before = hookLog.length
    await turn('compact', '/compact')
    out(`PostCompact hook calls: ${compacted}`)
    await turn('turn 12', PROBES[1]!.prompt, PROBES[1]!.fact, PROBES[1]!.item)
    const after = hookLog.slice(before)
    out(`\nCatalog arrived on prompts: ${hookLog.filter((h) => h.catalog).map((h) => h.n).join(', ') || 'none'} (of ${hookLog.length} hook calls)`)
    out(`Prompts after the compaction that carried it: ${after.filter((h) => h.catalog).length} of ${after.length}`)
    out(`Spent about $${spent.toFixed(3)} on ${MODEL}.`)
  })
})
