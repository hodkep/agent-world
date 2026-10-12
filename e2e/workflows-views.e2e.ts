import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const HOUR = 3_600_000
const j = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
const begin = (run: string, t: number, agent: string, name: string, title: string, extra: object = {}) => ({ k: 'begin', t, run, agent, name, project: '/p', title, ...extra })
const commit = (run: string, t: number, sha: string, subject: string, round: number, flagged = false) => ({ k: 'commit', t, run, round, sha, subject, ...(flagged && { flagged }) })

test('the Workflows window shows this week in numbers, with what each run cost from the ledger, and says which runs the app started', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfview-'))
  mkdirSync(join(home, 'aw'), { recursive: true })
  const now = Date.now()
  writeFileSync(join(home, 'aw', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  writeFileSync(
    join(home, 'aw', 'runs.jsonl'),
    j([
      begin('r1', now - 3 * HOUR, 'x1', 'ada', 'Add a dark-mode toggle'),
      commit('r1', now - 2.5 * HOUR, 'a41f9c2aaa', 'feat: toggle', 1),
      { k: 'done', t: now - 2 * HOUR, run: 'r1' },
      { k: 'round', t: now - 1.5 * HOUR, run: 'r1' },
      commit('r1', now - 1.2 * HOUR, '3c0aa18bbb', 'chore: tidy', 2, true),
      { k: 'done', t: now - 1 * HOUR, run: 'r1' },
      begin('r2', now - 0.5 * HOUR, 'x2', 'bo', 'Fix the login redirect'),
      commit('r2', now - 0.4 * HOUR, '7be03d1ccc', 'fix: redirect', 1),
      begin('r3', now - 0.2 * HOUR, 'x1', 'ada', 'add csv import', { auto: true }),
      commit('r3', now - 0.2 * HOUR, 'd00d00dddd', 'add csv import', 1),
      { k: 'done', t: now - 0.2 * HOUR, run: 'r3' }
    ])
  )
  // Ada spent $0.50 inside round 1 and $9 between the rounds, which belongs to no round.
  writeFileSync(
    join(home, 'aw', 'ledger.jsonl'),
    j([
      { k: 'cost', t: now - 2.4 * HOUR, agent: 'x1', project: '/p', model: 'sonnet', usd: 0.5 },
      { k: 'cost', t: now - 1.8 * HOUR, agent: 'x1', project: '/p', model: 'sonnet', usd: 9 }
    ])
  )
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    const sum = win.getByLabel('This week')
    await expect(sum).toContainText('3 runs')
    await expect(sum).toContainText('4 rounds')
    await expect(sum).toContainText('4 commits')
    await expect(sum).toContainText('1 with no open task')
    await expect(sum).toContainText('$0.50 spent in 2 h')
    const table = win.getByRole('table', { name: 'Runs' })
    const dark = table.getByRole('row', { name: /Add a dark-mode toggle/ })
    await expect(dark).toContainText('ada')
    await expect(dark).toContainText('2')
    await expect(dark).toContainText('$0.50')
    await expect(dark).toContainText('1 no task')
    const auto = table.getByRole('row', { name: /add csv import/ })
    await expect(auto).toContainText('from a commit')
    await expect(auto).toContainText('—')
    await expect(win).toContainText('open now')
    await expect(win).toContainText('bo: Fix the login redirect')
    await expect(win.getByText('app, from a commit')).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('an agent\'s Workflow tab shows its runs round by round with their commits, and is there only while workflows are on', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wftab-'))
  const project = join(home, 'project')
  mkdirSync(project)
  mkdirSync(join(home, 'aw'), { recursive: true })
  writeFileSync(join(home, 'aw', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const now = Date.now()
    writeFileSync(
      join(home, 'aw', 'runs.jsonl'),
      j([
        begin('r1', now - 3 * HOUR, ada!.id, 'ada', 'Add a dark-mode toggle'),
        commit('r1', now - 2.5 * HOUR, 'a41f9c2aaa', 'feat: toggle', 1),
        { k: 'done', t: now - 2 * HOUR, run: 'r1', summary: 'Toggle added to Settings.' },
        { k: 'round', t: now - 1.5 * HOUR, run: 'r1' },
        commit('r1', now - 1.2 * HOUR, '3c0aa18bbb', 'chore: tidy', 2, true)
      ])
    )
    await page.reload()
    await page.getByRole('tab', { name: /^Workflow/ }).click()
    const run = page.getByRole('article', { name: 'Add a dark-mode toggle' })
    await expect(run).toContainText('Toggle added to Settings.')
    const r2 = run.getByRole('region', { name: 'Round 2' })
    await expect(r2).toContainText('open')
    await expect(r2).toContainText('3c0aa18')
    await expect(r2).toContainText('no open task')
    const r1 = run.getByRole('region', { name: 'Round 1' })
    await expect(r1).toContainText('done · 1 commit')
    await expect(r1).toContainText('a41f9c2')

    // Off with nothing open hides the tab again.
    await page.evaluate(async () => {
      const p = await window.aw.getPrefs()
      await window.aw.setPrefs({ ...p, workflows: { ...p.workflows, enabled: false } })
    })
    await page.evaluate(() => window.aw.workflows.stopAll())
    await page.reload()
    await expect(page.getByRole('tab', { name: /^Workflow/ })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
