import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { startHookServer } from '../src/main/providers/claude/hookServer'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { WORKFLOW_HINT, WORKFLOW_TOOLS, planInstruction, workflowBrief } from '../src/main/workflows/hint'
import { Workflows } from '../src/main/workflows/service'
import { stepReply } from '../src/shared/steps'
import { toRunWorkflow } from '../src/shared/workflow'

/**
 * Does a real agent follow a workflow: announce the task and read its brief, do the work, report the step with step_done, wait for the
 * person's approval of the review step, and finish the task once it is approved?
 *   PILOT=1 PILOT_MODEL=sonnet PILOT_REPS=2 npx vitest run -c vitest.pilot.config.ts pilot/steps.pilot.ts   (PILOT_MAX_USD cap, default 2)
 * The app side is real (tools, service, the hook); the person is a script that approves the review step the first time it waits.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'sonnet'
const REPS = Number(process.env.PILOT_REPS ?? 2)
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 2)
const REPORT = 'pilot-report-steps.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

const REVIEWED = toRunWorkflow({
  version: 1,
  id: 'reviewed',
  name: 'Reviewed',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'auto' },
    { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change and commit it.' },
    { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge' }
  ]
})

describe.skipIf(!ON)('a workflow followed by a real agent', () => {
  it('reads the brief, reports its step, waits for the approval and finishes after it', async () => {
    writeFileSync(REPORT, `MODEL ${MODEL}, ${REPS} tasks\n`)
    let spent = 0
    for (let rep = 1; rep <= REPS && spent < MAX_USD; rep++) {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aw-stepspilot-')))
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
        enabled: () => true,
        since: () => 0,
        planGate: () => true,
        mergeGate: () => true,
        dial: () => 'balanced',
        ask: () => Promise.reject(new Error('no model calls in this pilot')),
        pick: () => REVIEWED,
        now: Date.now,
        newId: () => `r${++n}`,
        who: () => ({ name: 'pilot', project: work })
      })
      const calls: string[] = []
      const mcp = await startMcpServer({
        agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
        listAgents: () => [],
        send: () => 'queued',
        remember: () => undefined,
        recall: () => [],
        workflows: {
          offered: () => true,
          planInstruction: () => planInstruction('balanced'),
          begin: (c, title, followUp, workflow) => {
            calls.push(`task_begin(${workflow ?? ''})`)
            const id = wf.begin(c, title, { followUp, workflow })
            const run = wf.runs().find((r) => r.id === id)!
            const planFirst = wf.planWanted(c)
            return { planFirst, brief: workflowBrief(run.workflow!, { planFirst }) }
          },
          stepDone: (c, step) => {
            calls.push(`step_done(${step ?? ''})`)
            return wf.stepDone(c, step)
          },
          done: (c, s) => (calls.push('task_done'), wf.done(c, s)),
          submitPlan: async () => ({ questions: 0 })
        }
      })
      const hooks = await startHookServer({ agentForToken: (t) => (t === TOKEN ? 'pilot' : null), permissionTimeoutMs: 5000, onEvent: () => undefined, onPermission: () => undefined, onPermissionSettled: () => undefined, onStatus: () => undefined, blockEdit: (id, file, cwd) => wf.editBlock(id, file, cwd || work) })
      const mcpFile = join(dir, 'mcp.json')
      writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
      const settingsFile = join(dir, 'settings.json')
      writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
      let session = ''
      const ask = async (label: string, prompt: string) => {
        const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '16', '--append-system-prompt', WORKFLOW_HINT, '--mcp-config', mcpFile, '--settings', settingsFile, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Write', 'Bash', ...WORKFLOW_TOOLS, ...(session ? ['--resume', session] : [])]
        const out = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: work })) as { session_id?: string; total_cost_usd?: number; result?: string; num_turns?: number }
        session = out.session_id ?? session
        spent += out.total_cost_usd ?? 0
        const run = wf.runs()[0]
        appendFileSync(REPORT, `[task ${rep} ${label}] turns ${out.num_turns} $${(out.total_cost_usd ?? 0).toFixed(3)}; calls so far ${JSON.stringify(calls)}; run ${run ? run.status : 'none'}\n   reply: ${JSON.stringify((out.result ?? '').slice(0, 160))}\n`)
      }
      try {
        await ask('request', 'Add a `slugify(text)` function to slug.js that lowercases the text, trims it and replaces runs of spaces with single hyphens. Export it, add a test file slug.test.js (plain node assert) covering empty text, extra spaces and mixed case, make sure the tests pass with node, and commit it all with a clear message.')
        const run = wf.runs()[0]
        const waiting = run && wf.mergeCheck('pilot', 'x')?.blocking.some((b) => b.includes('has not been approved'))
        appendFileSync(REPORT, `[task ${rep}] after the request: step reported ${run?.rounds.at(-1)?.steps.map((s) => `${s.step}${s.implicit ? '*' : ''}`).join(',') || 'NONE'}; the review waits for the person: ${waiting ? 'yes' : 'NO'}\n`)
        if (waiting) {
          wf.approveStep(run!.id, 'ok', 'approved')
          await ask('approved', stepReply('Your review', 'approved'))
        }
        appendFileSync(REPORT, `[task ${rep}] end: ${wf.runs()[0]?.status}; commits ${(await git('log', '--oneline')).split('\n').length - 1} after the start\n`)
      } finally {
        mcp.close()
        hooks.close()
      }
    }
    appendFileSync(REPORT, `Spent about $${spent.toFixed(3)}.\n`)
  })
})
