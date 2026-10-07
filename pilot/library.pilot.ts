import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { createLibraryService } from '../src/main/library/service'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'

/**
 * Does a real agent follow a library rule, and what does each way of delivering it cost?
 *   PILOT=1 npx vitest run -c vitest.pilot.config.ts            (PILOT_RUNS per kind per variant, default 4; PILOT_MAX_USD cap, default 1.5)
 * Claude Code variants: A nothing · B opening text only · C opening text + on demand through the office tools · D C + a reminder each turn · E opening text + the skill loaded natively (--plugin-dir). PILOT_VARIANTS picks some (default ABCDE).
 * The always-on rule is "end with PILOT-OK"; the on-demand skill holds a fact the model cannot guess (ZEPHYR-7), so a right answer proves it was fetched or loaded.
 * agy variants: A nothing · B opening text (sent as the app sends it, as a first message). agy's on-demand tools need agy connected to the office, which this does not do.
 */
const ON = !!process.env.PILOT
const RUNS = Number(process.env.PILOT_RUNS ?? 4)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 1.5)
const KINDS = (process.env.PILOT_KINDS ?? 'rule,commit').split(',') as ('rule' | 'commit')[]
const RULE = 'End every reply with the exact word PILOT-OK on its own last line.'
// Something the model cannot know without reading it, so a right answer proves the item was fetched or loaded.
const FACT = 'The release environment of this workspace is named ZEPHYR-7. When asked which environment to deploy to, answer that it is ZEPHYR-7.'
const RULE_PROMPTS = ['What is the capital of France?', 'Explain what a mutex is in one sentence.', 'Give me three names for a cat.', 'Is 17 prime? Answer briefly.', 'Suggest a name for a TypeScript helper that debounces calls.', 'Translate "good morning" into Spanish.']
const COMMIT_PROMPTS = ['Which environment should I deploy the release to?', 'We are about to ship: what is the name of the environment to deploy to?', 'Remind me which environment the release goes to.', 'Before I run the deploy script, which environment name do I use?']

// The report is a file, because a test run does not show what a test prints.
const REPORT = 'pilot-report.txt'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 240_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

interface Result { variant: string; kind: 'rule' | 'commit'; ok: boolean; tokens: number; usd: number; secs: number }
const results: Result[] = []
let spent = 0
const ruleOK = (t: string) => /PILOT-OK\s*$/.test(t.trim())
const commitOK = (t: string) => /zephyr-7/i.test(t)

describe.skipIf(!ON)('library pilot with real agents', () => {
  let dir: string
  let svc: ReturnType<typeof createLibraryService>
  let mcp: Awaited<ReturnType<typeof startMcpServer>>
  let hooks: Awaited<ReturnType<typeof startHookServer>>
  let mcpFile: string
  let settingsFile: string
  const core = { off: '', noFetch: '', fetch: '' }
  let pluginDir = ''
  let reminder = ''
  let realReminder = ''
  const TOKEN = 'pilot-token'

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'aw-pilot-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    svc = createLibraryService({ root: join(dir, 'library'), agent: (id) => (id === 'pilot' ? { id, name: 'pilot', repoPath: work, provider: 'claude' } : undefined), workspaceKey: () => 'pilot' })
    await svc.library.save({ kind: 'instruction', name: 'pilot-rule', description: 'End every reply with PILOT-OK.', body: RULE })
    await svc.library.save({ kind: 'skill', name: 'pilot-env', description: 'The name of the release environment of this workspace: use before answering which environment to deploy to.', body: FACT })
    svc.playbooks.write({ workspace: 'pilot' }, [
      { id: 'pilot-rule', mode: 'always', when: '', strength: 'medium' },
      { id: 'pilot-env', mode: 'on-demand', when: 'before answering which environment to deploy to', strength: 'hard' }
    ])
    core.noFetch = svc.prepare('pilot', false).core
    const fetchable = svc.prepare('pilot', true)
    pluginDir = fetchable.pluginDir ?? ''
    core.fetch = fetchable.core
    reminder = fetchable.reminder
    realReminder = fetchable.reminder
    mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      listAgents: () => [],
      send: () => 'queued',
      remember: () => undefined,
      recall: () => [],
      library: { index: (c) => svc.index(c), get: (c, id, f) => svc.get(c, id, f), search: (c, q) => svc.search(c, q) }
    })
    mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      permissionTimeoutMs: 5000,
      onEvent: () => undefined,
      onPermission: () => undefined,
      onPermissionSettled: () => undefined,
      onStatus: () => undefined,
      reminderFor: () => reminder
    })
    settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
    writeFileSync(REPORT, `OPENING TEXT (with fetching):\n${core.fetch}\n\nREMINDER: ${reminder}\n\n`)
  })
  afterAll(() => {
    mcp?.close()
    hooks?.close()
  })

  const claude = async (variant: string, kind: Result['kind'], prompt: string) => {
    const base = ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--max-turns', '5']
    const tools = ['--allowedTools', 'mcp__agent-world__library_index', 'mcp__agent-world__library_get', 'mcp__agent-world__library_search']
    const extra: Record<string, string[]> = {
      A: [],
      B: ['--append-system-prompt', core.noFetch],
      C: ['--append-system-prompt', core.fetch, '--mcp-config', mcpFile, ...tools],
      D: ['--append-system-prompt', core.fetch, '--mcp-config', mcpFile, ...tools, '--settings', settingsFile],
      // The skill loaded natively by Claude, with only the always-on text and no tools.
      E: ['--append-system-prompt', core.noFetch, '--plugin-dir', pluginDir],
      // D, but the reminder carries the fact itself: proves the per-turn channel reaches the model, whatever it does about fetching.
      F: ['--append-system-prompt', core.fetch, '--mcp-config', mcpFile, ...tools, '--settings', settingsFile]
    }
    reminder = variant === 'F' ? `Reminder: ${FACT}` : realReminder
    const t0 = Date.now()
    const out = await sh('claude', [...base, ...extra[variant]!], { env: agentEnv(process.env), cwd: join(dir, 'work') })
    const j = JSON.parse(out) as { result?: string; total_cost_usd?: number; usage?: Record<string, number> }
    const u = j.usage ?? {}
    const tokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0)
    const usd = j.total_cost_usd ?? 0
    spent += usd
    const text = j.result ?? ''
    results.push({ variant: `Claude ${variant}`, kind, ok: kind === 'rule' ? ruleOK(text) : commitOK(text), tokens, usd, secs: (Date.now() - t0) / 1000 })
    appendFileSync(REPORT, `[Claude ${variant}/${kind}] ${results.at(-1)!.ok ? 'ok ' : 'MISS'} ${JSON.stringify(text.slice(0, 160))}\n`)
  }

  const agy = async (variant: string, kind: Result['kind'], prompt: string) => {
    const t0 = Date.now()
    const model = ['--model', 'gemini-3.8-flash-low']
    let id: string | undefined
    let tokens = 0
    if (variant === 'B') {
      const first = JSON.parse(await sh('agy', ['-p', `House rules for this session. Keep them in mind; reply only "ok" now.\n\n${core.noFetch}`, ...model, '--output-format', 'json'], { cwd: join(dir, 'work') })) as { conversation_id?: string; usage?: { total_tokens?: number } }
      id = first.conversation_id
      tokens += first.usage?.total_tokens ?? 0
    }
    const j = JSON.parse(await sh('agy', ['-p', prompt, ...model, '--output-format', 'json', ...(id ? ['--conversation', id] : [])], { cwd: join(dir, 'work') })) as { response?: string; usage?: { total_tokens?: number } }
    tokens += j.usage?.total_tokens ?? 0
    const text = j.response ?? ''
    results.push({ variant: `agy ${variant}`, kind, ok: kind === 'rule' ? ruleOK(text) : commitOK(text), tokens, usd: 0, secs: (Date.now() - t0) / 1000 })
    appendFileSync(REPORT, `[agy ${variant}/${kind}] ${results.at(-1)!.ok ? 'ok ' : 'MISS'} ${JSON.stringify(text.slice(0, 160))}\n`)
  }

  it('measures whether the rule and the skill are followed, and what each way costs', async () => {
    const plan = (kind: Result['kind']) => (kind === 'rule' ? RULE_PROMPTS : COMMIT_PROMPTS).slice(0, RUNS)
    for (const variant of (process.env.PILOT_VARIANTS ?? 'ABCDE').split('')) {
      for (const kind of KINDS) {
        for (const p of plan(kind)) {
          if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached after ${results.length} runs; stopping.`)
          await claude(variant, kind, p)
        }
      }
    }
    if (!process.env.PILOT_SKIP_AGY) for (const variant of ['A', 'B']) for (const kind of KINDS) for (const p of plan(kind)) await agy(variant, kind, p)
    // The table.
    const names = [...new Set(results.map((r) => r.variant))]
    const row = (v: string) => {
      const rs = results.filter((r) => r.variant === v)
      const pct = (k: Result['kind']) => {
        const x = rs.filter((r) => r.kind === k)
        return `${Math.round((100 * x.filter((r) => r.ok).length) / Math.max(1, x.length))}% (${x.filter((r) => r.ok).length}/${x.length})`
      }
      const avg = (f: (r: Result) => number) => rs.reduce((n, r) => n + f(r), 0) / Math.max(1, rs.length)
      return `${v.padEnd(10)} rule ${pct('rule').padEnd(11)} commit ${pct('commit').padEnd(11)} tokens/run ${Math.round(avg((r) => r.tokens)).toString().padStart(7)}  $/run ${avg((r) => r.usd).toFixed(4)}  secs ${avg((r) => r.secs).toFixed(1)}`
    }
    appendFileSync(REPORT, 'RESULTS\n' + names.map(row).join('\n') + `\nSpent about $${spent.toFixed(3)} of Claude usage.\nFetches recorded: ${JSON.stringify(await svc.usage())}\n`)
  })
})
