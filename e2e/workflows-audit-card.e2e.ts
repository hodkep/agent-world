import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key.' }, { kind: 'guess-wrong', text: 'Saved in localStorage.' }] })

const PULL = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }

async function office(name: string, findings = FINDINGS) {
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
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_AUDIT: findings, FAKE_AUDIT_DELAY_MS: '4000' }, tmp)
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
  const push = (...extra: string[]) => asAgent(ada!.cwd, 'push', ...extra, 'origin', ada!.branch!)
  const merge = () => asAgent(repo, 'merge', '--ff-only', ada!.branch!)
  const pushed = () => git(remote, 'branch', '--list', ada!.branch!)
  const landed = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.landed as { how: string; held: string[] } | undefined
  return { repo, home, git, page, ada: ada!, shutdown, merge, push, pushed, landed }
}


test('while the audit runs the chat says so, with the commits and the seconds, and the card is gone or the findings are there when it answers; a clean audit leaves one line that goes by itself', async () => {
  const o = await office('wfaudit', JSON.stringify({ findings: [] }))
  try {
    const { page, ada } = o
    const head = o.git(ada.cwd, 'rev-parse', 'HEAD')
    appendFileSync(join(o.home, 'runs.jsonl'), JSON.stringify({ k: 'commit', t: Date.now() - 1000, run: 'r1', round: 1, sha: head, subject: 'add toggle' }) + '\n')
    await page.evaluate((id) => void window.aw.finishAudit(id), ada.id)
    const card = page.getByRole('region', { name: "ada's audit" })
    await expect(card).toContainText('Reviewing 1 commit against your plan', { timeout: 10_000 })
    await expect(card.locator('.sc-bar')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Set aside' })).toBeVisible()
    await expect(card).toContainText(/\d+ s/)
    // Nothing found: the card gives way to one line, and the line goes after a few seconds.
    const line = page.getByRole('note', { name: "ada's audit found nothing" })
    await expect(line).toContainText('Found nothing in 1 commit', { timeout: 15_000 })
    await expect(line).toHaveCount(0, { timeout: 15_000 })
  } finally {
    await o.shutdown()
  }
})

test('an audit that found something turns the running card into the findings card', async () => {
  const o = await office('wfaudit2')
  try {
    const { page, ada } = o
    const head = o.git(ada.cwd, 'rev-parse', 'HEAD')
    appendFileSync(join(o.home, 'runs.jsonl'), JSON.stringify({ k: 'commit', t: Date.now() - 1000, run: 'r1', round: 1, sha: head, subject: 'add toggle' }) + '\n')
    await page.evaluate((id) => void window.aw.finishAudit(id), ada.id)
    await expect(page.getByRole('region', { name: "ada's audit" })).toContainText('Reviewing 1 commit', { timeout: 10_000 })
    await expect(page.getByRole('region', { name: "ada's audit" })).toContainText('2 things to look at', { timeout: 15_000 })
  } finally {
    await o.shutdown()
  }
})
