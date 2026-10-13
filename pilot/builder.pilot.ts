import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { BUILDER_TOOLS, builderInstructions, workflowDiff } from '../src/shared/builder'
import { goneSkills } from '../src/shared/skills'
import { startMcpServer } from '../src/main/mcpServer'
import { agentEnv, mcpConfig } from '../src/main/providers/claude/launch'
import { Approvals } from '../src/main/workflows/approvals'
import { Builder, Proposals } from '../src/main/workflows/builder'
import { WorkflowStore } from '../src/main/workflows/store'

/**
 * Does a real agent, given only the builder's instructions and tools, turn a request into a valid proposal that fits the project?
 *   PILOT=1 PILOT_MODEL=sonnet PILOT_MAX_USD=4 npx vitest run -c vitest.pilot.config.ts pilot/builder.pilot.ts
 * The app side is real (tools, file check, drafts); the person is scripted: if the agent asks a question instead of proposing, the reply is "your call".
 * Measured: a draft at the end, how many proposals the file check refused first, whether it asked, whether its commands exist in the project, and that it wrote nothing.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'sonnet'
const MAX_USD = Number(process.env.PILOT_MAX_USD ?? 4)
const REPORT = 'pilot-report-builder.txt'
const TOKEN = 'pilot-token'
const sh = (bin: string, args: string[], o: { env?: NodeJS.ProcessEnv; cwd?: string } = {}) =>
  new Promise<string>((resolve, reject) => execFile(bin, args, { env: o.env, cwd: o.cwd, timeout: 300_000, maxBuffer: 16 * 1024 * 1024 }, (err, out) => (err && !out ? reject(err) : resolve(out))))

const SAVED_BUG_FIX = { version: 1, id: 'bug-fix', name: 'Bug fix', when: 'A defect with a known symptom.', steps: [{ id: 'plan', kind: 'plan', gate: 'approve' }, { id: 'fix', kind: 'work', name: 'Fix, test first' }, { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 2 }, { id: 'land', kind: 'merge' }] }
const CASES: { name: string; request: string; saved?: object }[] = [
  { name: 'billing review', request: 'Every change to the billing code (src/billing) should get a security review and two approvals before it lands.' },
  { name: 'fast path', request: 'I want a fast path for typo and copy fixes: no plan, no audit, just build and land.' },
  { name: 'bug fix', request: 'Make a bug-fix workflow: a failing test first, the tests and the type check must pass, and then I read the diff myself.' },
  { name: 'vague', request: 'Make our process better.' },
  { name: 'too big', request: 'I want a workflow with twenty stages: idea, research, spec, design, review of the design, prototype, build, unit tests, integration tests, lint, type check, security, performance, docs, changelog, QA, staging, approval, release notes and land.' },
  { name: 'skills', request: 'Add a review step to the saved bug-fix workflow after the fix. It should use our review skill, and our deploy-notes skill once it is out.', saved: SAVED_BUG_FIX },
  { name: 'edit', request: 'Change the saved bug-fix workflow: it should also run lint, and give the tests one more try before it asks me.', saved: SAVED_BUG_FIX }
]

describe.skipIf(!ON)('the builder with a real agent', () => {
  it('turns requests into valid proposals that fit the project, and writes nothing', async () => {
    writeFileSync(REPORT, `MODEL ${MODEL}, ${CASES.length} requests\n`)
    let spent = 0
    const only = process.env.PILOT_ONLY?.split(',')
    for (const c of CASES.filter((x) => !only || only.includes(x.name))) {
      if (spent >= MAX_USD) break
      const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aw-bpilot-')))
      const work = join(dir, 'shop')
      mkdirSync(join(work, 'src', 'billing'), { recursive: true })
      writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit', build: 'vite build' } }, null, 2))
      writeFileSync(join(work, 'src', 'billing', 'invoice.ts'), 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)\n')
      const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=p@e.com', '-c', 'user.name=P', ...a], { cwd: work, encoding: 'utf8' })
      git('init', '-q', '-b', 'main')
      const store = new WorkflowStore(join(dir, 'home', 'workflows'))
      if (c.saved) {
        mkdirSync(join(work, '.agent-world', 'workflows'), { recursive: true })
        writeFileSync(join(work, '.agent-world', 'workflows', 'bug-fix.json'), JSON.stringify(c.saved, null, 2) + '\n')
      }
      git('add', '-A')
      git('commit', '-qm', 'start')
      const builder = new Builder({ store, approvals: new Approvals(join(dir, 'approvals.json')), proposals: new Proposals(join(dir, 'proposals.json')), skills: { items: () => [{ id: 'tdd', kind: 'skill', description: 'Write the failing test first, then the code.' }, { id: 'code-review', kind: 'skill', description: 'Review a diff against our standards, before merging.' }, { id: 'house-style', kind: 'instruction', description: 'How we write.' }], playbook: () => new Set(['tdd']) }, now: Date.now })
      let proposeCalls = 0
      let refused = 0
      const mcp = await startMcpServer({
        agentForToken: (t) => (t === TOKEN ? 'pilot' : null), listAgents: () => [], send: () => 'queued', remember: () => undefined, recall: () => [],
        builder: {
          offered: () => true,
          list: () => builder.list(work),
          get: (_c, id) => builder.get(work, id),
          propose: (_c, file) => {
            proposeCalls++
            try {
              return builder.propose('pilot', work, file)
            } catch (e) {
              refused++
              throw e
            }
          }
        }
      })
      const mcpFile = join(dir, 'mcp.json')
      writeFileSync(mcpFile, JSON.stringify(mcpConfig({ url: mcp.url, agentToken: TOKEN })))
      let session = ''
      let turns = 0
      let asked = false
      let cost = 0
      const ask = async (prompt: string) => {
        const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '25', '--append-system-prompt', builderInstructions(), '--mcp-config', mcpFile, '--permission-mode', 'plan', '--allowedTools', 'Read', 'Glob', 'Grep', ...BUILDER_TOOLS.map((t) => `mcp__agent-world__${t}`), ...(session ? ['--resume', session] : [])]
        const out = JSON.parse(await sh('claude', args, { env: agentEnv(process.env), cwd: work })) as { session_id?: string; total_cost_usd?: number; result?: string }
        session = out.session_id ?? session
        cost += out.total_cost_usd ?? 0
        spent += out.total_cost_usd ?? 0
        turns++
        return out.result ?? ''
      }
      try {
        let reply = await ask(c.request)
        if (!builder.view('pilot', work)) {
          asked = true
          appendFileSync(REPORT, `[${c.name}] asked first: ${JSON.stringify(reply.slice(0, 200))}\n`)
          reply = await ask('Your call: pick sensible defaults and propose it now.')
        }
        const v = builder.view('pilot', work)
        const scripts = ['test', 'lint', 'typecheck', 'build']
        const bad = (v?.commands ?? []).flatMap((x) => x.text.split(/\s*&&\s*/)).filter((x) => !(x === 'npm test' || scripts.some((s) => x === `npm run ${s}`)))
        const wrote = existsSync(join(work, '.agent-world', 'workflows')) ? readdirSync(join(work, '.agent-world', 'workflows')).filter((f) => f !== 'bug-fix.json' || !c.saved).length : 0
        const dirty = git('status', '--porcelain').split('\n').filter((l) => l && !l.includes('.agent-world') && !l.includes('excalidraw.log'))
        const diff = c.saved && v ? workflowDiff(c.saved as never, v.workflow) : undefined
        appendFileSync(
          REPORT,
          `[${c.name}] draft ${v ? `yes (${v.workflow.steps.length} steps: ${v.workflow.steps.map((s) => s.kind).join(' > ')})` : 'NO'}; propose calls ${proposeCalls}, refused by the file check ${refused}; asked ${asked ? 'yes' : 'no'}; turns ${turns}; $${cost.toFixed(3)}\n` +
            `   commands not in package.json: ${bad.length ? JSON.stringify(bad) : 'none'}; files written ${wrote}; repo dirty ${dirty.length ? JSON.stringify(dirty) : 'no'}\n` +
            (v ? `   id ${v.workflow.id}; when: ${JSON.stringify(v.workflow.when ?? '')}\n` : '') +
            (v ? `   skills in the draft: ${JSON.stringify(v.skills)}; gone ${goneSkills(v.skills).length}\n` : '') +
            (diff ? `   edit: +${diff.added.length} -${diff.removed.length} ~${diff.changed.length}, id kept ${v!.workflow.id === 'bug-fix'}\n` : '') +
            `   reply: ${JSON.stringify(reply.slice(0, 600))}\n`
        )
      } finally {
        mcp.close()
      }
    }
    appendFileSync(REPORT, `Spent about $${spent.toFixed(3)}.\n`)
  })
})
