import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { seedWeek } from './workflowsWeek'

async function week(old = false) {
  const home = mkdtempSync(join(tmpdir(), 'aw-runsview-'))
  const project = join(home, 'project')
  mkdirSync(project)
  mkdirSync(join(home, 'aw'), { recursive: true })
  writeFileSync(join(home, 'aw', 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
  await page.reload()
  await hire(page, { name: 'ada' })
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  seedWeek(join(home, 'aw'), { ada: ada!.id, project, old })
  await page.reload()
  await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
  return { page, shutdown, win: page.getByRole('dialog', { name: 'Workflows' }) }
}

test('the Runs tab says the week in a few sentences and draws each run as a bar that opens to say how it went', async () => {
  const { win, shutdown } = await week()
  try {
    const sum = win.getByLabel('This week')
    await expect(sum).toContainText('8 runs this week.')
    await expect(sum).toContainText('5 of 6 finished runs met every gate.')
    await expect(sum).toContainText(/Agents spent (58|59|60)m waiting on you\./)
    await expect(sum).toContainText('Checks failed the first time in 2 of 5 runs.')
    await expect(sum).toContainText('1 landing went ahead anyway.')
    await expect(sum).toContainText('1 began from a commit.')
    await expect(sum).toContainText('1 waiting on you now.')

    const runs = win.getByRole('list', { name: 'Runs' })
    await expect(runs.getByRole('listitem')).toHaveCount(8)
    // A bar for a run that has times; none for the run begun from a commit.
    const billing = runs.getByRole('listitem').filter({ hasText: 'Billing export' })
    await expect(billing.getByRole('img')).toHaveAttribute('aria-label', /waiting on you 25m.*checks/)
    await expect(runs.getByRole('listitem').filter({ hasText: 'add csv import' })).toContainText('no times were recorded')
    await expect(billing.locator('.rb-flag.anyway')).toBeVisible()

    // A click opens the run in place: line by line, what met its gate, what went with trouble and what was missed.
    await billing.getByRole('button').click()
    const sheet = billing.getByRole('region', { name: 'How Billing export went' })
    await expect(sheet).toContainText('Plan sent, then you lifted the hold after 25m without approving it')
    await expect(sheet).toContainText('Check failed once, passed on try 2')
    await expect(sheet).toContainText('Review found 1 thing you did not look at: “No test for empty export.”')
    await expect(sheet).toContainText('Landed anyway, with review still holding it')
    await expect(sheet.locator('li.bad')).toHaveCount(3)
    await billing.getByRole('button').click()
    await expect(sheet).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('the Insights tab is a tile for every gate of every run, with the numbers under each column and what stands out, over 7 or 30 days', async () => {
  const { win, shutdown } = await week(true)
  try {
    await win.getByRole('tab', { name: 'Insights' }).click()
    const grid = win.getByRole('table', { name: 'Gates met by each run' })
    await expect(grid.getByRole('row')).toHaveCount(1 + 8 + 1)
    const billing = grid.getByRole('row').filter({ hasText: 'Billing export' })
    await expect(billing.getByRole('cell').nth(0)).toHaveAttribute('aria-label', 'Plan: missed or overridden')
    await expect(billing.getByRole('cell').nth(1)).toHaveAttribute('aria-label', 'Check: met after trouble (1)')
    await expect(billing.getByRole('cell').nth(2)).toHaveAttribute('aria-label', 'Review: missed or overridden')
    await expect(billing.getByRole('cell').nth(3)).toHaveAttribute('aria-label', 'Land: missed or overridden')
    await expect(billing.getByRole('cell').nth(4)).toHaveAttribute('aria-label', 'Told: met first time')
    const foot = grid.getByRole('row').last()
    await expect(foot).toContainText('2 of 4plans approved as sent')
    await expect(foot).toContainText('3 of 5checks first try')
    await expect(foot).toContainText('2 of 3findings seen')
    await expect(foot).toContainText('1 anywaylandings')
    await expect(foot).toContainText('7 of 8announced')
    await expect(win).toContainText('Billing export is the red row: the plan hold was lifted, a finding was not seen, it landed anyway.')
    await expect(win).toContainText('Check is the amber column: 2 of 5 runs needed more than one try. The check may be stricter than the request.')

    // Thirty days brings back the run from twenty days ago.
    await win.getByRole('radio', { name: '30 days' }).click()
    await expect(grid.getByRole('row')).toHaveCount(1 + 9 + 1)
    await expect(grid).toContainText('Old export')
    await win.getByRole('radio', { name: '7 days' }).click()
    await expect(grid).not.toContainText('Old export')
  } finally {
    await shutdown()
  }
})
