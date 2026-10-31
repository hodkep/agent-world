import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { seedWeek } from './workflowsWeek'

async function week(old = false, openWindow = true) {
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
  if (openWindow) await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
  return { page, shutdown, win: page.getByRole('dialog', { name: 'Workflows' }) }
}

test('the Runs tab is two charts (how often each workflow ran, how each step ended in each run) over a ledger of runs grouped by what to do about them, over 7 or 30 days', async () => {
  const { win, shutdown } = await week(true)
  try {
    // The charts say their numbers in words as well.
    await expect(win.getByRole('img', { name: 'Workflows invoked: Journey 5, Bug fix 1, Quick change 1' })).toBeVisible()
    await expect(win.getByRole('img', { name: 'Runs per day' })).toBeVisible()
    await expect(win.locator('.rb-tile')).toHaveCount(4)

    // The ledger: the run that waits on the person first, then what landed with trouble, then what landed clean, with how many each.
    const ledger = win.getByRole('table', { name: 'Runs' })
    await expect(ledger.locator('.rb-grp')).toHaveText([/Needs you.*2/, /Landed with trouble.*1/, /Landed clean.*4.*2 needed a second try/, /Not announced.*1.*no task was started/])
    await expect(ledger.getByRole('row').filter({ hasText: 'add csv import' })).toContainText('—')
    // A run with many todos shows the first five as chips on a row that stays short, and "+2 more" opens the run, which lists them all.
    const dark = ledger.getByRole('row').filter({ hasText: 'dark-mode toggle' }).first()
    await expect(dark.locator('.rb-todo')).toHaveText(['todo#101', 'todo#102', 'todo#103', 'todo#104', 'todo#105', '+2 more'])
    expect((await dark.boundingBox())!.height).toBeLessThan(90)
    await dark.getByRole('button', { name: '+2 more' }).click()
    await expect(win.getByLabel('Todos').locator('.rb-todo')).toHaveCount(7)
    await dark.getByRole('button', { name: /dark-mode toggle/ }).click()
    const billing = ledger.getByRole('row').filter({ hasText: 'Billing export' })
    await expect(billing).toContainText('1 h 30 m')
    await expect(billing).toContainText('25m')
    await expect(billing).toContainText(/\d of \d met/)
    await expect(ledger.getByRole('row').filter({ hasText: 'Old export' })).toHaveCount(0)

    // The heading of a column carries the week's total for it.
    await expect(ledger.getByRole('columnheader', { name: /Steps/ })).toContainText('met, skipped, failed')

    // A click opens the run in place: line by line, what met its gate, what went with trouble and what was missed.
    await billing.getByRole('button', { name: /Billing export/ }).click()
    const sheet = win.getByRole('region', { name: 'How Billing export went' })
    await expect(sheet).toContainText('Plan sent, then you lifted the hold after 25m without approving it')
    await expect(sheet).toContainText('Check failed once, passed on try 2')
    await expect(sheet).toContainText('Review found 1 thing you did not look at: “No test for empty export.”')
    await expect(sheet).toContainText('Landed anyway. Not met: review.')
    await expect(sheet.locator('li.bad')).toHaveCount(3)
    await billing.getByRole('button', { name: /Billing export/ }).click()
    await expect(sheet).toHaveCount(0)

    // 30 days brings the older run into the charts and the ledger.
    await win.getByRole('radio', { name: '30 days' }).click()
    await expect(win.getByRole('img', { name: /Workflows invoked: Journey 6,/ })).toBeVisible()
    await expect(ledger.getByRole('row').filter({ hasText: 'Old export' })).toHaveCount(1)
  } finally {
    await shutdown()
  }
})

test('the Insights tab says, workflow by workflow, how many steps were met and which steps keep being skipped or failed, over 7 or 30 days', async () => {
  const { win, shutdown } = await week(true)
  try {
    await win.getByRole('tab', { name: 'Insights' }).click()
    const journey = win.getByRole('region', { name: 'Journey workflow' })
    await expect(journey).toContainText('5 runs')
    await expect(journey).toContainText('steps met')
    await expect(win.getByRole('region', { name: 'Bug fix workflow' })).toContainText('1 run')

    // Thirty days brings back the run from twenty days ago.
    await win.getByRole('radio', { name: '30 days' }).click()
    await expect(journey).toContainText('6 runs')
    await win.getByRole('radio', { name: '7 days' }).click()
    await expect(journey).toContainText('5 runs')
  } finally {
    await shutdown()
  }
})

test('the agent\'s tab is the track of its open run and its week as a tile for each run; a tile or the link opens the window on it', async () => {
  const { page, shutdown, win } = await week(false, false)
  try {
    await page.getByRole('tab', { name: /^Workflow/ }).click()
    // The tab shows the run as a flow first, and the rail is one click away.
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
    await page.getByRole('button', { name: 'Rail' }).click()
    const track = page.getByRole('region', { name: 'Add a slug length limit: where ada is' }).first()
    await expect(track).toBeVisible()
    await expect(track.locator('.st.now')).toContainText('Plan')
    await expect(track.getByRole('status')).toHaveText('needs your approval')
    await expect(page.getByText(/This week · \d+ runs?/)).toBeVisible()
    const days = page.getByRole('list', { name: 'This week' })
    await expect(days.getByRole('listitem')).toHaveCount(7)
    // The open run's tile is waiting, and a tile opens that run in the window.
    await days.getByRole('button', { name: 'Add a slug length limit: waiting' }).click()
    await expect(win.getByRole('region', { name: 'How Add a slug length limit went' })).toContainText('waiting for you')
    await win.getByRole('button', { name: 'Close' }).click()
    // The link opens the window on its runs, with none opened.
    await page.getByRole('button', { name: /All of ada's runs in Workflows/ }).click()
    await expect(win.getByRole('table', { name: 'Runs' })).toBeVisible()
    await expect(win.getByRole('region', { name: /^How .* went$/ })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
