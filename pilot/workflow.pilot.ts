import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { startMcpServer } from '../src/main/mcpServer'
import { LOG_FORMAT, parseCommitLog } from '../src/main/workflows/commits'
import { WORKFLOW_HINT, WORKFLOW_REMINDER, WORKFLOW_TOOLS } from '../src/main/workflows/hint'
import { Workflows } from '../src/main/workflows/service'
import { agentEnv, hookSettings, mcpConfig } from '../src/main/providers/claude/launch'
import { startHookServer } from '../src/main/providers/claude/hookServer'

/**
 * Does a real agent record its tasks, with the opening text alone (A) or with a reminder at each turn while no task is open (B)?
 *   PILOT=1 PILOT_MODEL=sonnet PILOT_VARIANTS=AB npx vitest run -c vitest.pilot.config.ts pilot/workflow.pilot.ts   (PILOT_MAX_USD cap, default 1.5)
 * Each variant runs in a throwaway git repo against the real tools and text, one session of: three code tasks, a question, a follow-up.
 * Commits are read back the way the app reads them at a turn's end.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'sonnet'
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 1.5)
const REPORT = 'pilot-report-workflow.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

const PROMPTS: { kind: 'task' | 'question' | 'follow-up'; text: string }[] = [
  { kind: 'task', text: 'Add a function `slugify(text)` to slug.js that lowercases the text and replaces spaces with hyphens, export it, and commit it with a clear message.' },
  { kind: 'task', text: 'Now add and export `truncate(text, n)` to slug.js: it cuts text longer than n characters and adds "..."; add a few example calls in a comment, and commit.' },
  { kind: 'question', text: 'In one sentence, what does the slug function in slug.js do? Do not change anything.' },
  { kind: 'task', text: 'Add and export `titleCase(text)` to slug.js that capitalises the first letter of every word, and commit it.' },
  { kind: 'follow-up', text: 'One more thing for that titleCase work: it should leave small words like "of" and "the" lower-case unless they start the text. Update it and commit.' }
]

describe.skipIf(!ON)('workflow recording with a real agent', () => {
  let spent = 0
  writeFileSync(REPORT, `MODEL ${MODEL}\nOPENING TEXT: ${WORKFLOW_HINT}\nREMINDER (variant B): ${WORKFLOW_REMINDER}\n\n`)

  async function variant(v: 'A' | 'B') {
    const dir = mkdtempSync(join(tmpdir(), 'aw-wfpilot-'))
    const work = join(dir, 'work')
    mkdirSync(work)
    const git = (...a: string[]) => sh('git', a, { cwd: work })
    await git('init', '-q', '-b', 'main')
    await git('config', 'user.email', 'pilot@example.com')
    await git('config', 'user.name', 'Pilot')
    writeFileSync(join(work, 'slug.js'), '// Turn a title into a url part.\nexports.slug = (t) => t.toLowerCase()\n')
    await git('add', '-A')
    await git('commit', '-q', '-m', 'start')
    const first = (await git('rev-parse', 'HEAD')).trim()
    let n = 0
    const wf = new Workflows(join(dir, 'runs.jsonl'), { enabled: () => true, now: Date.now, newId: () => `r${++n}`, who: () => ({ name: 'pilot', project: work }) })
    const mcp = await startMcpServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      listAgents: () => [],
      send: () => 'queued',
      remember: () => undefined,
      recall: () => [],
      workflows: { offered: () => true, begin: (c, title, followUp) => void wf.begin(c, title, { followUp }), done: (c, summary) => wf.done(c, summary) }
    })
    const hooks = await startHookServer({
      agentForToken: (t) => (t === TOKEN ? 'pilot' : null),
      permissionTimeoutMs: 5000,
      onEvent: () => undefined,
      onPermission: () => undefined,
      onPermissionSettled: () => undefined,
      onStatus: () => undefined,
      // The reminder is only said while no task is open, so an agent in the middle of one pays nothing.
      reminderFor: () => (v === 'B' && !wf.runs().some((r) => r.status === 'open') ? WORKFLOW_REMINDER : '')
    })
    const mcpFile = join(dir, 'mcp.json')
    writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
    const settingsFile = join(dir, 'settings.json')
    writeFileSync(settingsFile, JSON.stringify(hookSettings({ url: hooks.url, token: TOKEN, permissionTimeoutSec: 30, platform: process.platform })))
    let sessionId = ''
    let begun = 0
    let expected = 0
    try {
      for (const [i, p] of PROMPTS.slice(0, Number(process.env.PILOT_PROMPTS ?? PROMPTS.length)).entries()) {
        if (spent > MAX_USD) throw new Error(`Spend cap of $${MAX_USD} reached`)
        const args = ['-p', p.text, '--model', MODEL, '--output-format', 'json', '--max-turns', '14', '--append-system-prompt', WORKFLOW_HINT, '--mcp-config', mcpFile, '--settings', settingsFile, '--permission-mode', 'acceptEdits', '--allowedTools', 'Read', 'Edit', 'Write', 'Bash', ...WORKFLOW_TOOLS, ...(i ? ['--resume', sessionId] : [])]
        const beforeRuns = wf.runs().length
        const beforeRounds = wf.runs().reduce((x, r) => x + r.rounds.length, 0)
        const out = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: work })) as { session_id?: string; total_cost_usd?: number; permission_denials?: unknown[]; num_turns?: number }
        sessionId = out.session_id ?? sessionId
        spent += out.total_cost_usd ?? 0
        for (const c of parseCommitLog(await sh('git', ['log', '--reverse', `--format=${LOG_FORMAT}`, `${first}..HEAD`], { cwd: work }))) wf.commit('pilot', c.sha, c.subject, c.at)
        const runs = wf.runs()
        const newRuns = runs.length - beforeRuns
        const newRounds = runs.reduce((x, r) => x + r.rounds.length, 0) - beforeRounds
        const recorded = p.kind === 'task' ? newRuns === 1 : p.kind === 'question' ? newRuns === 0 && newRounds === 0 : newRounds === 1 && newRuns === 0
        if (p.kind !== 'question') expected++
        if (recorded && p.kind !== 'question') begun++
        appendFileSync(REPORT, `[${v}/${p.kind}] new runs ${newRuns}, new rounds ${newRounds} -> ${recorded ? 'as wanted' : 'NOT as wanted'}  $${(out.total_cost_usd ?? 0).toFixed(3)} turns ${out.num_turns} denials ${JSON.stringify(out.permission_denials ?? [])}\n`)
      }
      const runs = wf.runs()
      appendFileSync(REPORT, `[${v}] recorded ${begun}/${expected} tasks. Runs: ${JSON.stringify(runs.map((r) => ({ title: r.title, status: r.status, rounds: r.rounds.map((x) => x.commits.map((c) => (c.flagged ? 'FLAGGED ' : '') + c.subject)) })))}\n\n`)
    } finally {
      mcp.close()
      hooks.close()
    }
  }

  it('measures whether the agent records its tasks, with and without the per-turn reminder', async () => {
    for (const v of (process.env.PILOT_VARIANTS ?? 'AB').split('') as ('A' | 'B')[]) await variant(v)
    appendFileSync(REPORT, `Spent about $${spent.toFixed(3)}.\n`)
  })
})
