import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { WORKFLOW_HINT, WORKFLOW_TOOLS } from '../src/main/workflows/hint'
import { Workflows } from '../src/main/workflows/service'
import { planReply } from '../src/shared/plan'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'
import { readFileSync, realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'

/**
 * Can a real agent follow the plan gate: announce the task, write a plan the app accepts, wait, and build once approved?
 *   PILOT=1 PILOT_MODEL=sonnet npx vitest run -c vitest.pilot.config.ts pilot/plan.pilot.ts   (PILOT_MAX_USD cap, default 1)
 * The app side is real (tools, plan check, the hook that refuses edits); the person is a script that approves the first plan it sees.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'sonnet'
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 1)
const REPORT = 'pilot-report-plan.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

describe.skipIf(!ON)('plan gate with a real agent', () => {
  it('announces, plans, waits, and builds after approval', async () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aw-planpilot-')))
    const work = join(dir, 'work')
    mkdirSync(work)
    const git = (...a: string[]) => sh('git', a, { cwd: work })
    await git('init', '-q', '-b', 'main')
    await git('config', 'user.email', 'pilot@example.com')
    await git('config', 'user.name', 'Pilot')
    writeFileSync(join(work, 'slug.js'), '// Turn a title into a url part.\nexports.slug = (t) => t.toLowerCase()\n')
    await git('add', '-A')
    await git('commit', '-qm', 'start')
    let n = 0
    const wf = new Workflows(join(dir, 'runs.jsonl'), { enabled: () => true, since: () => 0, planGate: () => true, now: Date.now, newId: () => `r${++n}`, who: () => ({ name: 'pilot', project: work }) })
    const denied: string[] = []
    const mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      listAgents: () => [],
      send: () => 'queued',
      remember: () => undefined,
      recall: () => [],
      workflows: {
        offered: () => true,
        planGate: () => true,
        begin: (c, title, followUp) => {
          const id = wf.begin(c, title, { followUp })
          return { planFirst: wf.runs().find((r) => r.id === id)?.rounds.length === 1 }
        },
        done: (c, s) => wf.done(c, s),
        submitPlan: async (c, path) => {
          const rel = relative(work, resolve(work, path))
          if (rel.startsWith('..')) throw new Error('The plan must be a file inside your worktree.')
          return wf.submitPlan(c, rel, readFileSync(resolve(work, path), 'utf8'))
        }
      }
    })
    const hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      permissionTimeoutMs: 5000,
      onEvent: () => undefined,
      onPermission: () => undefined,
      onPermissionSettled: () => undefined,
      onStatus: () => undefined,
      blockEdit: (id, file, cwd) => {
        const why = wf.editBlock(id, file, cwd || work)
        if (why) denied.push(`${file.replace(work, '.')}: ${why.slice(0, 40)}`)
        return why
      }
    })
    const mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    const settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
    writeFileSync(REPORT, `MODEL ${MODEL}\n`)
    let spent = 0
    let session = ''
    const ask = async (label: string, prompt: string) => {
      if (spent > MAX_USD) throw new Error('Spend cap reached')
      const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '16', '--append-system-prompt', WORKFLOW_HINT, '--mcp-config', mcpFile, '--settings', settingsFile, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Write', 'Bash', ...WORKFLOW_TOOLS, ...(session ? ['--resume', session] : [])]
      const out = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: work })) as { session_id?: string; total_cost_usd?: number; result?: string; num_turns?: number }
      session = out.session_id ?? session
      spent += out.total_cost_usd ?? 0
      const run = wf.runs()[0]
      appendFileSync(REPORT, `[${label}] turns ${out.num_turns} $${(out.total_cost_usd ?? 0).toFixed(3)} run ${run ? `"${run.title}" ${run.status}, plan ${run.rounds.at(-1)?.plan?.state ?? 'none'}` : 'none'}; edits refused so far: ${JSON.stringify(denied)}\n   reply: ${JSON.stringify((out.result ?? '').slice(0, 200))}\n`)
    }
    try {
      await ask('turn 1: the request', 'Add and export a function `slugify(text)` to slug.js that lowercases the text and replaces spaces with hyphens, and commit it with a clear message.')
      const waiting = wf.runs().find((r) => r.rounds.at(-1)?.plan?.state === 'submitted')
      appendFileSync(REPORT, `plan waiting after turn 1: ${waiting ? 'yes' : 'NO'}\n`)
      if (waiting) {
        appendFileSync(REPORT, `read-back: ${JSON.stringify(waiting.rounds.at(-1)!.plan!.readback)}\n`)
        wf.decide(waiting.id, 'approved')
        await ask('turn 2: approved', planReply('approved', {}))
      }
      const log = await git('log', '--oneline')
      appendFileSync(REPORT, `commits: ${JSON.stringify(log.split('\n'))}\nSpent about $${spent.toFixed(3)}.\n`)
    } finally {
      mcp.close()
      hooks.close()
    }
  })
})
