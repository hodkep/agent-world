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
    // The invoked chart counts the runs of a workflow (none here) and the one the app began from a commit apart; the cost column's heading is the total from the ledger.
    await expect(win.getByText('0 runs · 1 from a commit')).toBeVisible()
    const runs = win.getByRole('table', { name: 'Runs' })
    await expect(runs.getByRole('columnheader', { name: /Cost/ })).toContainText('$0.50')
    // What each run cost and how many rounds and commits it took are in the run, when it is opened.
    const dark = runs.getByRole('row').filter({ hasText: 'Add a dark-mode toggle' })
    await expect(dark).toContainText('ada')
    await expect(dark).toContainText('2 rounds')
    await dark.getByRole('button').click()
    await expect(win.getByRole('region', { name: 'How Add a dark-mode toggle went' })).toContainText('2 rounds · 2 commits (1 with no open task) · $0.50')
    const auto = runs.getByRole('row').filter({ hasText: 'add csv import' })
    await expect(auto).toContainText('from a commit')
    await expect(auto).toContainText('—')
    const open = runs.getByRole('row').filter({ hasText: 'Fix the login redirect' })
    await expect(open).toContainText('bo')
    await expect(open).toContainText('open')
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
    // The run follows no workflow, so there is no track; the week is a tile for it, and the tile opens it in the window.
    await expect(page.getByText('Nothing is running for ada')).toBeVisible()
    const tile = page.getByRole('list', { name: 'This week' }).getByRole('button', { name: /Add a dark-mode toggle/ })
    await expect(tile).toBeVisible()
    await tile.click()
    const sheet = page.getByRole('dialog', { name: 'Workflows' }).getByRole('region', { name: 'How Add a dark-mode toggle went' })
    await expect(sheet).toContainText('Follow-up round 2 began')
    const commits = sheet.getByLabel('Commits')
    await expect(commits).toContainText('a41f9c2')
    await expect(commits).toContainText('3c0aa18')
    await expect(commits).toContainText('no open task')
    await page.getByRole('dialog', { name: 'Workflows' }).getByRole('button', { name: 'Close' }).click()

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
