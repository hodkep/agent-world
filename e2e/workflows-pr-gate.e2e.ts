import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }] })

const PULL = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }

async function office(name: string, findings = FINDINGS, flow: object = PULL) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_AUDIT: findings }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page, { name: 'ada' })
  await page.getByRole('tab', { name: 'Chat' }).click()
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  await expect.poll(() => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
  const env = JSON.parse(readFileSync(envFile, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string; git: Record<string, string> }
  // git as the agent's own processes run it: the environment the app started the agent with.
  const asAgent = (cwd: string, ...args: string[]) =>
    new Promise<{ ok: boolean; out: string }>((done) =>
      execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
    )
  // The agent's task, with its plan approved, and one commit on its branch.
  const log = join(home, 'runs.jsonl')
  const t = Date.now()
  appendFileSync(log, [
    { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle', workflow: flow },
    { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
    { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
  git(ada!.cwd, 'add', '-A')
  git(ada!.cwd, 'commit', '-qm', 'add toggle')
  appendFileSync(log, JSON.stringify({ k: 'commit', t: t - 1000, run: 'r1', round: 1, sha: git(ada!.cwd, 'rev-parse', 'HEAD'), subject: 'add toggle' }) + '\n')
  const remote = join(tmp, 'remote.git')
  git(tmp, 'init', '-q', '--bare', remote)
  git(repo, 'remote', 'add', 'origin', remote)
  const push = (...extra: string[]) => asAgent(ada!.cwd, 'push', ...extra, 'origin', ada!.branch!)
  const merge = () => asAgent(repo, 'merge', '--ff-only', ada!.branch!)
  const pushed = () => git(remote, 'branch', '--list', ada!.branch!)
  const landed = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.landed as { how: string; held: string[] } | undefined
  const as = (...a: string[]) => asAgent(ada!.cwd, ...a)
  return { repo, git, page, ada: ada!, shutdown, merge, push, pushed, landed, as, remote, tmp }
}


test('a pull request waits for the audit on every branch pushed: other commits are refused, the audited head goes through under any name, and the agent is told when the audit has passed', async () => {
  const o = await office('wfprgate')
  try {
    const { ada, page } = o
    // Work is done on the agent's own branch: a commit on another branch of its worktree is refused, a branch made at its head is not.
    expect((await o.as('branch', 'fix/copy', ada.branch!)).ok).toBe(true)
    expect((await o.as('switch', '-q', '-c', 'fix/other')).ok).toBe(true)
    writeFileSync(join(ada.cwd, 'other.ts'), 'export const other = 1\n')
    await o.as('add', '-A')
    const refused = await o.as('commit', '-qm', 'other')
    expect(refused.ok).toBe(false)
    expect(refused.out).toContain(`Commit on your own branch, ${ada.branch}, not on fix/other`)
    await o.as('switch', '-q', ada.branch!)

    // No push before the audit has passed, under any name; the first asks for the audit.
    const held = await o.as('push', 'origin', 'fix/copy')
    expect(held.ok).toBe(false)
    expect(held.out).toContain('Agent World: this push is held.')
    await expect.poll(async () => (await o.as('push', 'origin', 'fix/copy')).out, { timeout: 20_000 }).toContain('1 audit finding has not been seen.')

    // Seen: nothing holds the push any more, and the app tells the agent to open the pull request.
    await page.evaluate((id) => window.aw.finishSeen(id, [0]), ada.id)
    // The step has no gate of its own and the Settings merge gate is on, so the person approves the push; the agent is told to push only then.
    appendFileSync(join(o.tmp, 'home', 'runs.jsonl'), [{ k: 'step', t: Date.now(), run: 'r1', round: 1, step: 'build', state: 'done' }, { k: 'done', t: Date.now() + 1, run: 'r1' }].map((e) => JSON.stringify(e)).join('\n') + '\n')
    await expect.poll(() => page.evaluate(() => window.aw.workflows.summary().then((s) => s.runs[0]!.status)), { timeout: 20_000 }).toBe('done')
    // The log was written by hand, so the window is not told: it is loaded again.
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.getByRole('region', { name: 'Step from ada' }).getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user', { hasText: 'has passed' })).toBeVisible({ timeout: 20_000 })

    // Other commits are refused whatever the name; the audited head goes through as a copy.
    o.git(o.repo, 'branch', 'fix/extra', ada.branch!)
    writeFileSync(join(ada.cwd, 'x.ts'), 'x\n')
    o.git(ada.cwd, 'switch', '-q', 'fix/extra')
    o.git(ada.cwd, 'add', '-A')
    o.git(ada.cwd, 'commit', '-qm', 'extra')
    o.git(ada.cwd, 'switch', '-q', ada.branch!)
    const extra = await o.as('push', 'origin', 'fix/extra')
    expect(extra.ok).toBe(false)
    expect(extra.out).toContain('fix/extra holds commits the audit has not looked at')
    expect((await o.as('push', 'origin', 'fix/copy')).ok).toBe(true)
    expect(o.git(o.tmp + '/remote.git', 'branch', '--list', 'fix/copy')).toContain('fix/copy')
  } finally {
    await o.shutdown()
  }
})

test('a pull request step with gate approve waits for the person: the push is held and the agent is not told to push until Approve, and a push made with the hooks off is noticed', async () => {
  test.setTimeout(120_000)
  const gated = { ...PULL, steps: (PULL.steps as { kind: string }[]).map((s) => (s.kind === 'pr' ? { ...s, gate: 'approve' } : s)) }
  const o = await office('wfprapprove', JSON.stringify({ findings: [] }), gated)
  try {
    const { ada, page } = o
    // The audit finds nothing, so only the person's approval is left.
    await expect.poll(async () => { const r = await o.as('push', 'origin', ada.branch!); return r.out }, { timeout: 30_000 }).toContain("'Pull request' has not been approved.")
    // The agent says it is done: now the step's turn has come and the person is asked.
    appendFileSync(join(o.tmp, 'home', 'runs.jsonl'), [{ k: 'step', t: Date.now(), run: 'r1', round: 1, step: 'build', state: 'done' }, { k: 'done', t: Date.now() + 1, run: 'r1' }].map((e) => JSON.stringify(e)).join('\n') + '\n')
    // The log was written by hand, so the window is not told: it is loaded again.
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.getByRole('region', { name: 'Step from ada' })
    await expect(card).toContainText('nothing is pushed until you approve', { timeout: 20_000 })
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user', { hasText: 'has passed' })).toHaveCount(0)
    expect(o.pushed()).toBe('')

    // Approved: the card goes, the agent is told to push, and the push goes through.
    await card.getByRole('button', { name: 'Approve' }).click()
    await expect(card).toHaveCount(0)
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user', { hasText: 'has passed' })).toBeVisible({ timeout: 20_000 })
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed, { timeout: 20_000 }).toMatchObject({ how: 'checked' })
  } finally {
    await o.shutdown()
  }
})

test('a push made with the hooks off is noticed: the run is recorded as pushed without the hold, and the track moves on', async () => {
  test.setTimeout(120_000)
  const o = await office('wfprnotice', JSON.stringify({ findings: [] }))
  try {
    const { ada } = o
    // git as an agent that unset the office's settings runs it: no hook sees the push.
    execFileSync('git', ['push', 'origin', `${ada.branch!}:copy`], { cwd: ada.cwd, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_CONFIG') && !k.startsWith('AW_'))) as NodeJS.ProcessEnv })
    expect(o.git(o.remote, 'branch', '--list', 'copy')).toContain('copy')
    await expect.poll(o.landed, { timeout: 40_000 }).toMatchObject({ how: 'anyway' })
    expect(((await o.landed()) as { held: string[] }).held.join(' ')).toContain('hold')
  } finally {
    await o.shutdown()
  }
})
