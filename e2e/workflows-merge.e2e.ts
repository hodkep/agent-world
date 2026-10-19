import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire, launchApp } from './launch'

const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key; the plan puts a theme per project out of scope.' }, { kind: 'guess-wrong', text: 'The choice is saved in localStorage; the plan guessed preferences.json.' }] })

async function office(name: string, o: { dial: string; env?: Record<string, string> }) {
  const tmp = mkdtempSync(join(tmpdir(), `aw-${name}-`))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: o.dial, since: 1, planGate: true, mergeGate: true } }))
  const auditLog = join(tmp, 'audit.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_AUDIT_LOG: auditLog, ...o.env }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page, { name: 'ada' })
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
  git(ada!.cwd, 'add', '-A')
  git(ada!.cwd, 'commit', '-qm', 'add toggle')
  const log = join(tmp, 'home', 'runs.jsonl')
  const t = Date.now()
  const add = (...events: object[]) => appendFileSync(log, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const begin = () => add({ k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a dark-mode toggle' })
  const plan = () => add({ k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [{ kind: 'guessed', text: 'The choice is saved in preferences.json.' }], outOfScope: ['A theme per project.'], questions: [] } })
  return { tmp, repo, git, page, ada: ada!, shutdown, auditLog, add, begin, plan, runs: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { k: string; how?: string; held?: string[] }) }
}

test('the merge gate: Finish shows the plan against what the audit found, holds Land until the plan is approved and the findings seen, and the server refuses until then', async () => {
  const o = await office('wfmerge', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    o.begin()
    o.plan()
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    // The agent never reported its work here, so the audit has not started by itself.
    await dialog.getByRole('button', { name: 'Run the audit now' }).click()
    const block = dialog.getByRole('group', { name: 'Against the plan' })
    await expect(block).toContainText('Add a dark-mode toggle to Settings.')
    await expect(block).toContainText('Out of scope: A theme per project.')
    await expect(dialog.getByRole('list', { name: 'What the audit found' })).toContainText('Adds a project key', { timeout: 15_000 })
    await expect(block).toContainText('Guess wrong')
    await expect(block).toContainText('Audited 1 file')
    await expect(block).toContainText('claude-haiku-5-5 · $0.0040')
    // What the model was shown: the goal, the out-of-scope line and the diff of the commit, not the plan file.
    const asked = JSON.parse(readFileSync(o.auditLog, 'utf8').trim().split('\n')[0]!) as string
    expect(asked).toContain('Add a dark-mode toggle to Settings.')
    expect(asked).toContain('A theme per project.')
    expect(asked).toContain('+export const dark = true')

    // Two things hold Land: the plan was never approved, and two findings are unseen.
    await expect(dialog).toContainText('The plan is still waiting for your approval.')
    await expect(dialog).toContainText('2 audit findings have not been seen.')
    await expect(dialog.getByRole('button', { name: 'Land anyway on main' })).toBeVisible()
    const refused = await o.page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }).then(() => 'landed', (e: Error) => e.message), o.ada.id)
    expect(refused).toContain('Not ready to land')
    expect(refused).toContain('The plan is still waiting for your approval.')

    // Seen, fine on both, then the person approves the plan: the checks turn to ticks and Land is plain.
    for (const box of await dialog.getByRole('checkbox', { name: 'Seen, fine' }).all()) {
      await box.click()
      await expect(box).toBeChecked()
    }
    await expect(dialog).toContainText('Audit: 2 findings, all seen')
    await o.page.evaluate(() => window.aw.workflows.decide('r1', 'approved'))
    await expect(dialog).toContainText('Plan approved')
    const land = dialog.getByRole('button', { name: 'Land on main' })
    await expect(land).toBeEnabled()
    await land.click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    expect(o.git(o.repo, 'log', '--format=%s', 'main').split('\n')).toContain('add toggle')
    expect(o.runs().find((e) => e.k === 'merge')).toMatchObject({ how: 'checked', held: [] })
  } finally {
    await o.shutdown()
  }
})

test('Land anyway is always possible and is recorded with what was holding it, and asks no model when there is no plan to audit against', async () => {
  const o = await office('wfmerge2', { dial: 'balanced' })
  try {
    o.begin()
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    await expect(dialog).toContainText('No plan was approved for this task.')
    await dialog.getByRole('button', { name: 'Land anyway on main' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    expect(o.runs().find((e) => e.k === 'merge')).toMatchObject({ how: 'anyway', held: ['No plan was approved for this task.'] })
    expect(() => readFileSync(o.auditLog, 'utf8')).toThrow()
  } finally {
    await o.shutdown()
  }
})

test('at economy a plan is optional so landing is not held for a missing one, and no audit runs and the row says so', async () => {
  const o = await office('wfmerge2b', { dial: 'economy' })
  try {
    o.begin()
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    await expect(dialog).toContainText('Audit is off at the economy dial.')
    await expect(dialog).not.toContainText('No plan was approved')
    await dialog.getByRole('button', { name: 'Land on main' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    expect(o.runs().find((e) => e.k === 'merge')).toMatchObject({ how: 'checked', held: [] })
    expect(() => readFileSync(o.auditLog, 'utf8')).toThrow()
  } finally {
    await o.shutdown()
  }
})

test('an audit that fails says why, never holds Land, and can be run again', async () => {
  const o = await office('wfmerge3', { dial: 'balanced', env: { FAKE_AUDIT_FAIL: 'Credit balance is too low' } })
  try {
    o.begin()
    o.plan()
    o.add({ k: 'plan', t: Date.now() - 3000, run: 'r1', round: 1, state: 'approved' })
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    // The agent never reported its work here, so the audit has not started by itself.
    await dialog.getByRole('button', { name: 'Run the audit now' }).click()
    await expect(dialog).toContainText('The audit failed: Credit balance is too low', { timeout: 15_000 })
    await expect(dialog.getByRole('button', { name: 'Land on main' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Run the audit again' }).click()
    await expect.poll(() => readFileSync(o.auditLog, 'utf8').trim().split('\n').length).toBe(2)
    // The run, opened from the agent's Workflow tab, keeps the line.
    await o.page.getByRole('tab', { name: 'Workflow' }).click()
    await o.page.getByRole('list', { name: 'This week' }).getByRole('button', { name: /Add a dark-mode toggle/ }).click()
    await expect(o.page.getByRole('dialog', { name: 'Workflows' }).getByRole('region', { name: 'How Add a dark-mode toggle went' })).toContainText('Review could not run: Credit balance is too low')
  } finally {
    await o.shutdown()
  }
})

test('the merge gate has its own switch in Settings; off, Finish shows nothing of the plan or the audit and no model is asked', async () => {
  const o = await office('wfmerge4', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    o.begin()
    o.plan()
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Features' }).click()
    const gate = settings.getByRole('switch', { name: /^Merge gate/ })
    await expect(gate).toBeChecked()
    await gate.click()
    await expect(gate).not.toBeChecked()
    await expect.poll(() => JSON.parse(readFileSync(join(o.tmp, 'home', 'preferences.json'), 'utf8')).workflows.mergeGate).toBe(false)
    await settings.getByRole('button', { name: 'Close' }).click()
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    await expect(dialog).toContainText('1 commit on aw/ada to land')
    await expect(dialog.getByRole('group', { name: 'Against the plan' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Land on main' })).toBeEnabled()
    expect(() => readFileSync(o.auditLog, 'utf8')).toThrow()
  } finally {
    await o.shutdown()
  }
})
