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
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: o.dial, since: 1 } }))
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

const status = (page: import('@playwright/test').Page, id: string) => page.evaluate((i) => window.aw.finishStatus(i, { readOnly: true }), id)

test('the merge gate: the audit card shows what it found against the plan, landing is held until the plan is approved and the findings seen, and the server refuses until then', async () => {
  const o = await office('wfmerge', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    o.begin()
    o.plan()
    await chatTab(o.page)
    // The agent never reported its work here, so the audit has not started by itself: nothing asks for the person, and the card is not there.
    const card = o.page.getByRole('region', { name: "ada's audit" })
    await expect(card).toHaveCount(0)
    await o.page.evaluate((id) => window.aw.finishAudit(id), o.ada.id)
    await expect(card).toContainText('2 things to look at', { timeout: 15_000 })
    await expect(card).toContainText('Adds a project key')
    await expect(card).toContainText('out of scope · src/theme.ts')
    await expect(card).toContainText('guess may be wrong')
    // What the audit read and what it cost are kept in its record.
    const merge = (await status(o.page, o.ada.id)).merge!
    expect(merge.planned).toMatchObject({ goal: 'Add a dark-mode toggle to Settings.', outOfScope: ['A theme per project.'] })
    expect(merge.audit).toMatchObject({ state: 'done', files: 1, model: 'claude-haiku-5-5', cost: 0.004 })
    // What the model was shown: the goal, the out-of-scope line and the diff of the commit, not the plan file.
    const asked = JSON.parse(readFileSync(o.auditLog, 'utf8').trim().split('\n')[0]!) as string
    expect(asked).toContain('Add a dark-mode toggle to Settings.')
    expect(asked).toContain('A theme per project.')
    expect(asked).toContain('+export const dark = true')

    // Two things hold landing: the plan was never approved, and two findings are unseen. The server refuses.
    expect(merge.blocking).toEqual(['The plan is still waiting for your approval.', '2 audit findings have not been seen.'])
    const refused = await o.page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }).then(() => 'landed', (e: Error) => e.message), o.ada.id)
    expect(refused).toContain('Not ready to land')
    expect(refused).toContain('The plan is still waiting for your approval.')

    // All seen in one answer, then the person approves the plan: nothing holds landing, and it lands.
    await card.getByRole('button', { name: 'All seen, fine' }).click()
    await expect(card).toHaveCount(0)
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual(['The plan is still waiting for your approval.'])
    await o.page.evaluate(() => window.aw.workflows.decide('r1', 'approved'))
    await expect.poll(async () => (await status(o.page, o.ada.id)).merge!.blocking).toEqual([])
    await o.page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }), o.ada.id)
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
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual(['No plan was approved for this task.'])
    await o.page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false, anyway: true }), o.ada.id)
    expect(o.runs().find((e) => e.k === 'merge')).toMatchObject({ how: 'anyway', held: ['No plan was approved for this task.'] })
    expect(() => readFileSync(o.auditLog, 'utf8')).toThrow()
  } finally {
    await o.shutdown()
  }
})

test('at economy a plan is optional so landing is not held for a missing one, and no audit runs and the status says so', async () => {
  const o = await office('wfmerge2b', { dial: 'economy' })
  try {
    o.begin()
    await chatTab(o.page)
    const merge = (await status(o.page, o.ada.id)).merge!
    expect(merge.audit).toEqual({ state: 'off', reason: 'economy' })
    expect(merge.blocking).toEqual([])
    await expect(o.page.getByRole('region', { name: "ada's audit" })).toHaveCount(0)
    await o.page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }), o.ada.id)
    expect(o.runs().find((e) => e.k === 'merge')).toMatchObject({ how: 'checked', held: [] })
    expect(() => readFileSync(o.auditLog, 'utf8')).toThrow()
  } finally {
    await o.shutdown()
  }
})

test('an audit that fails says why on its card, never holds landing, and can be run again', async () => {
  const o = await office('wfmerge3', { dial: 'balanced', env: { FAKE_AUDIT_FAIL: 'Credit balance is too low' } })
  try {
    o.begin()
    o.plan()
    o.add({ k: 'plan', t: Date.now() - 3000, run: 'r1', round: 1, state: 'approved' })
    await chatTab(o.page)
    const card = o.page.getByRole('region', { name: "ada's audit" })
    // The agent never reported its work here, so the audit has not started by itself.
    await o.page.evaluate((id) => window.aw.finishAudit(id), o.ada.id)
    await expect(card).toContainText('The audit failed', { timeout: 15_000 })
    await expect(card).toContainText('Credit balance is too low')
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual([])
    await card.getByRole('button', { name: 'Run the audit again' }).click()
    await expect.poll(() => readFileSync(o.auditLog, 'utf8').trim().split('\n').length).toBe(2)
    // The run, opened from the agent's Workflow tab, keeps the line.
    await o.page.getByRole('tab', { name: 'Workflow' }).click()
    await o.page.getByRole('list', { name: 'This week' }).getByRole('button', { name: /Add a dark-mode toggle/ }).click()
    await expect(o.page.getByRole('dialog', { name: 'Workflows' }).getByRole('region', { name: 'How Add a dark-mode toggle went' })).toContainText('Review could not run: Credit balance is too low')
  } finally {
    await o.shutdown()
  }
})

test('Settings has no switch for the plan gate or the merge gate: whether a step asks is set on the step', async () => {
  const o = await office('wfmerge4', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Features' }).click()
    await expect(settings.getByRole('switch', { name: /^Workflows/ })).toBeChecked()
    await expect(settings.getByRole('switch', { name: /^Plan gate/ })).toHaveCount(0)
    await expect(settings.getByRole('switch', { name: /^Merge gate/ })).toHaveCount(0)
  } finally {
    await o.shutdown()
  }
})

test('the audit card is the last thing in the conversation and never above the message box; Set aside leaves one quiet line with Undo, holds nothing, and the run says the audit was not followed', async () => {
  const o = await office('wfmerge5', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    o.begin()
    o.plan()
    o.add({ k: 'plan', t: Date.now() - 3000, run: 'r1', round: 1, state: 'approved' })
    await chatTab(o.page)
    await o.page.evaluate((id) => window.aw.finishAudit(id), o.ada.id)
    const card = o.page.getByRole('region', { name: "ada's audit" })
    await expect(card).toContainText('2 things to look at', { timeout: 15_000 })
    // It sits in the conversation, after the last of it, and above the message box there is nothing but the box's own bar.
    await expect(o.page.locator('.chat-log').getByRole('region', { name: "ada's audit" })).toHaveCount(1)
    await expect(o.page.locator('.finish-band, .land-band')).toHaveCount(0)
    const [log, box, c] = [await o.page.locator('.chat-log').boundingBox(), await o.page.getByRole('textbox', { name: 'Message ada' }).boundingBox(), await card.boundingBox()]
    expect(c!.y + c!.height).toBeLessThanOrEqual(log!.y + log!.height + 1)
    expect(c!.y + c!.height).toBeLessThanOrEqual(box!.y)
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual(['2 audit findings have not been seen.'])

    await card.getByRole('button', { name: 'Set aside' }).click()
    await expect(card).toHaveCount(0)
    const line = o.page.getByRole('note', { name: "ada's audit, set aside" })
    await expect(line).toContainText('You set the audit aside · 2 things not looked at')
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual([])

    // The run says so in its own words, in the ledger.
    await o.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = o.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('table', { name: 'Runs' }).getByRole('button', { name: /Add a dark-mode toggle/ }).click()
    await expect(win.getByRole('region', { name: 'How Add a dark-mode toggle went' })).toContainText('You set the review aside with 2 things not looked at')
    await win.getByRole('button', { name: 'Close' }).first().click()

    // Undo brings the card and what it holds back.
    await line.getByRole('button', { name: 'Undo' }).click()
    await expect(line).toHaveCount(0)
    await expect(card).toContainText('2 things to look at')
    expect((await status(o.page, o.ada.id)).merge!.blocking).toEqual(['2 audit findings have not been seen.'])
  } finally {
    await o.shutdown()
  }
})
