import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { startHookServer } from '../src/main/providers/claude/hookServer'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { WORKFLOW_HINT, WORKFLOW_TOOLS, planInstruction, workflowBrief } from '../src/main/workflows/hint'
import { checkEnv, runCheck } from '../src/main/workflows/runCheck'
import { Workflows } from '../src/main/workflows/service'
import { stepReply } from '../src/shared/steps'
import { toRunWorkflow } from '../src/shared/workflow'

/**
 * Does a real agent act on a failed check: read what the app sent back, fix it, report again, and finish once the check passes?
 *   PILOT=1 PILOT_MODEL=sonnet PILOT_REPS=3 npx vitest run -c vitest.pilot.config.ts pilot/checks.pilot.ts   (PILOT_MAX_USD cap, default 2)
 * The project's check (an inline command the agent is not shown) asks for more than the request says (accents removed), so the first try is likely to fail.
 * The app side is real (tools, service, the command runner); the office's message is typed as the agent's next prompt, as the app does.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'sonnet'
const REPS = Number(process.env.PILOT_REPS ?? 3)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 2)
const REPORT = 'pilot-report-checks.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

const FLOW = toRunWorkflow(
  { version: 1, id: 'checked', name: 'Checked', steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change and commit it.' }, { id: 'tests', kind: 'check', name: 'Project check', run: `node -e "const { slugify } = require('./slug.js'); const a = require('node:assert'); a.strictEqual(slugify('Hello World'), 'hello-world'); a.strictEqual(slugify('Café au lait'), 'cafe-au-lait'); console.log('ok')"`, gate: 'pass', retries: 2 }, { id: 'land', kind: 'merge' }] },
  'pilot-hash'
)
describe.skipIf(!ON)('a failed check with a real agent', () => {
  it('reads what was sent back, fixes it, reports again and finishes', async () => {
    writeFileSync(REPORT, `MODEL ${MODEL}, ${REPS} tasks\n`)
    let spent = 0
    for (let rep = 1; rep <= REPS && spent < MAX_USD; rep++) {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aw-chkpilot-')))
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
      const wf = new Workflows(join(dir, 'runs.jsonl'), {
        enabled: () => true, since: () => 0, planGate: () => true, mergeGate: () => true, dial: () => 'balanced',
        ask: () => Promise.reject(new Error('no model calls in this pilot')),
        run: (command, cwd) => runCheck(command, cwd, { env: checkEnv(process.env, process.env.PATH ?? '') }),
        approved: () => true,
        cwd: () => work,
        pick: () => FLOW, now: Date.now, newId: () => `r${++n}`, who: () => ({ name: 'pilot', project: work })
      })
      const calls: string[] = []
      const outcomes: { ran: number; sendBack?: string; gaveUp?: string }[] = []
      const kick = (c: string) => {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, encoding: 'utf8' }).trim()
        void wf.runChecks(c, head).then((r) => outcomes.push(r))
      }
      const mcp = await startMcpServer({
        agentForToken: (t) => (t === TOKEN ? 'pilot' : null), listAgents: () => [], send: () => 'queued', remember: () => undefined, recall: () => [],
        workflows: {
          offered: () => true,
          planInstruction: () => planInstruction('balanced'),
          begin: (c, title, followUp, workflow) => {
            calls.push('task_begin')
            const id = wf.begin(c, title, { followUp, workflow })
            const planFirst = wf.planWanted(c)
            return { planFirst, brief: workflowBrief(wf.runs().find((r) => r.id === id)!.workflow!, { planFirst }) }
          },
          stepDone: (c, step) => {
            calls.push('step_done')
            const r = wf.stepDone(c, step)
            if (r.checking) kick(c)
            return r
          },
          done: (c, s) => (calls.push('task_done'), wf.done(c, s)),
          submitPlan: async () => ({ questions: 0 })
        }
      })
      const hooks = await startHookServer({ agentForToken: (t) => (t === TOKEN ? 'pilot' : null), permissionTimeoutMs: 5000, onEvent: () => undefined, onPermission: () => undefined, onPermissionSettled: () => undefined, onStatus: () => undefined, blockEdit: () => null })
      const mcpFile = join(dir, 'mcp.json')
      writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
      const settingsFile = join(dir, 'settings.json')
      writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
      let session = ''
      const ask = async (label: string, prompt: string) => {
        const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '20', '--append-system-prompt', WORKFLOW_HINT, '--mcp-config', mcpFile, '--settings', settingsFile, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Write', 'Bash', ...WORKFLOW_TOOLS, ...(session ? ['--resume', session] : [])]
        const out = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: work })) as { session_id?: string; total_cost_usd?: number; result?: string; num_turns?: number }
        session = out.session_id ?? session
        spent += out.total_cost_usd ?? 0
        appendFileSync(REPORT, `[task ${rep} ${label}] turns ${out.num_turns} $${(out.total_cost_usd ?? 0).toFixed(3)}; calls ${JSON.stringify(calls)}\n   reply: ${JSON.stringify((out.result ?? '').slice(0, 140))}\n`)
      }
      const waitForCheck = async () => {
        for (let i = 0; i < 100 && outcomes.length === 0; i++) await new Promise((r) => setTimeout(r, 100))
        return outcomes.shift()
      }
      try {
        await ask('request', 'Add a `slugify(text)` function to slug.js that lowercases the text, trims it and replaces runs of spaces with single hyphens. Export it, add a test file slug.test.js (plain node assert) covering empty text, extra spaces and mixed case, make sure the tests pass with node, and commit it all with a clear message.')
        let outcome = await waitForCheck()
        let rounds = 0
        while (outcome?.sendBack && rounds++ < 3) {
          appendFileSync(REPORT, `[task ${rep}] check failed, sent back (${rounds}): ${JSON.stringify(outcome.sendBack.slice(0, 160))}\n`)
          await ask(`fix ${rounds}`, outcome.sendBack)
          outcome = await waitForCheck()
        }
        const final = wf.mergeCheck('pilot', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: work, encoding: 'utf8' }).trim())
        appendFileSync(REPORT, `[task ${rep}] end: check ${final === null ? 'n/a' : final.checks[0]?.state}, sent back ${rounds} time(s), gave up ${outcome?.gaveUp ? 'yes' : 'no'}; the agent reported ${calls.filter((c) => c === 'step_done').length} time(s)\n`)
        void stepReply
      } finally {
        mcp.close()
        hooks.close()
      }
    }
    appendFileSync(REPORT, `Spent about $${spent.toFixed(3)}.\n`)
  })
})
