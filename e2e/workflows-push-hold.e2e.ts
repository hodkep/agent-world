import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'Saved in localStorage.' }] })

const PULL = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }

async function office(name: string) {
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
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true } }))
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_AUDIT: FINDINGS }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page, { name: 'ada' })
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
    { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle', workflow: PULL },
    { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
    { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
  writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
  git(ada!.cwd, 'add', '-A')
  git(ada!.cwd, 'commit', '-qm', 'add toggle')
  const remote = join(tmp, 'remote.git')
  git(tmp, 'init', '-q', '--bare', remote)
  git(repo, 'remote', 'add', 'origin', remote)
  const push = () => asAgent(ada!.cwd, 'push', 'origin', ada!.branch!)
  const merge = () => asAgent(repo, 'merge', '--ff-only', ada!.branch!)
  const pushed = () => git(remote, 'branch', '--list', ada!.branch!)
  const landed = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.landed as { how: string; held: string[] } | undefined
  return { repo, git, page, ada: ada!, shutdown, merge, push, pushed, landed }
}

test('an agent that pushes its branch from the chat is held by git itself while the review has findings the person has not seen, and the push goes through once the person allows it, which ends the run', async () => {
  const o = await office('wfpush')
  try {
    // The review has not run: the push is refused in the office's words, and the review starts.
    const first = await o.push()
    expect(first.ok).toBe(false)
    expect(first.out).toContain('Agent World: this push is held. Not yet: The review has not run for this branch yet.')
    expect(o.pushed()).toBe('')
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await expect.poll(() => o.page.evaluate(() => window.aw.landingHolds())).toEqual([expect.objectContaining({ agentId: o.ada.id, held: ['2 audit findings have not been seen.'] })])
    expect(o.pushed()).toBe('')
    expect(await o.landed()).toBeUndefined()
    // The agent cannot allow it; the person does, and the next push goes through and the run ends there, logged as pushed anyway.
    await o.page.evaluate((id) => window.aw.landingAllow(id), o.ada.id)
    expect((await o.push()).ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
    await expect.poll(o.landed).toMatchObject({ how: 'anyway', held: ['2 audit findings have not been seen.'] })
    expect(await o.page.evaluate(() => window.aw.landingHolds())).toEqual([])
  } finally {
    await o.shutdown()
  }
})

test('the same push goes through with no say from the person once the findings were seen, and the base branch is not held for a run that ends in a pull request', async () => {
  const o = await office('wfpush2')
  try {
    await o.push()
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    await o.page.evaluate((id) => window.aw.finishSeen(id, [0, 1]), o.ada.id)
    expect((await o.push()).ok).toBe(true)
    await expect.poll(o.landed).toMatchObject({ how: 'checked', held: [] })
    // Moving main is GitHub's once the pull request is merged there: git does not ask the office about it for this run.
    const m = await o.merge()
    expect(m.out).not.toContain('Agent World')
  } finally {
    await o.shutdown()
  }
})

test('a held push shows in the chat as a card that says the push is held, and Set aside lifts it and records the audit as not followed', async () => {
  const o = await office('wfpush3')
  try {
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    await o.push()
    await expect.poll(async () => (await o.push()).out, { timeout: 20_000 }).toContain('2 audit findings have not been seen.')
    const card = o.page.getByRole('region', { name: "ada's push is held" })
    await expect(card).toBeVisible()
    await expect(card).toContainText('PUSH HELD')
    await expect(card).toContainText('1 thing holds the push')
    await expect(o.page.getByRole('region', { name: 'Add a dark-mode toggle: where ada is' }).first().getByText('Push held', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Set aside' }).click()
    await expect(card).toHaveCount(0)
    await expect(o.page.getByRole('note', { name: "ada's audit, set aside" })).toContainText('You set the audit aside · 2 things not looked at')
    expect((await o.push()).ok).toBe(true)
    expect(o.pushed()).toContain('aw/')
  } finally {
    await o.shutdown()
  }
})
