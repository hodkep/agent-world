import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const begin = (run: string, t: number, agent: string, name: string, title: string, project = '/p') => ({ k: 'begin', t, run, agent, name, project, title })

test('turning workflows off with runs open: the confirm lists them, "let them finish" keeps the button as winding down, "stop them now" closes them and hides it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfruns-'))
  const project = join(home, 'project')
  mkdirSync(project)
  mkdirSync(join(home, 'aw'), { recursive: true })
  const events = [
    begin('r1', 1000, 'x1', 'ada', 'Add a dark-mode toggle', project),
    { k: 'done', t: 2000, run: 'r1' },
    { k: 'round', t: 3000, run: 'r1' },
    begin('r2', 3500, 'x2', 'bo', 'Fix the login redirect', project),
    // Another project's run: the window is about the project that is open.
    begin('r9', 3600, 'x9', 'cy', 'Rotate the signing keys', '/other'),
    { k: 'done', t: 3700, run: 'r9' }
  ]
  writeFileSync(join(home, 'aw', 'runs.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    const bar = page.locator('header')

    // Workflows are off, but two runs are open: the button stays, and its window says so.
    await expect(bar.getByRole('button', { name: 'Workflows' })).toBeVisible()
    await bar.getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    await expect(win).toContainText('Winding down')
    await expect(win).toContainText('2 runs are still open')
    await expect(win.getByRole('table', { name: 'Runs' })).not.toContainText('Rotate the signing keys')
    await expect(win.getByRole('table', { name: 'Runs' })).toContainText('Add a dark-mode toggle')
    await win.getByRole('button', { name: 'Close' }).click()

    // On, then off again: the confirm names the open runs, and cancelling keeps it on.
    await bar.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Features' }).click()
    const sw = settings.getByRole('switch', { name: /^Workflows/ })
    await sw.click()
    await expect(sw).toBeChecked()
    await sw.click()
    const ask = page.getByRole('alertdialog', { name: 'Turn off workflows' })
    await expect(ask).toContainText('2 runs are still open')
    await expect(ask).toContainText('ada: Add a dark-mode toggle (round 2)')
    await expect(ask).toContainText('bo: Fix the login redirect')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(sw).toBeChecked()

    // Let them finish: off, and the button stays.
    await sw.click()
    await page.getByRole('alertdialog', { name: 'Turn off workflows' }).getByRole('button', { name: 'Let them finish, then hide' }).click()
    await expect(sw).not.toBeChecked()
    await settings.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByRole('button', { name: 'Workflows' })).toBeVisible()
    expect((await page.evaluate(() => window.aw.workflows.summary())).open).toBe(2)

    // Stop them now: the runs close as stopped and the button goes.
    await bar.getByRole('button', { name: 'Settings', exact: true }).click()
    await settings.getByRole('tab', { name: 'Features' }).click()
    await sw.click()
    await sw.click()
    await page.getByRole('alertdialog', { name: 'Turn off workflows' }).getByRole('button', { name: 'Stop them now' }).click()
    await expect(sw).not.toBeChecked()
    await settings.getByRole('button', { name: 'Close' }).click()
    await expect(bar.getByRole('button', { name: 'Workflows' })).toHaveCount(0)
    const after = await page.evaluate(() => window.aw.workflows.summary())
    expect(after.open).toBe(0)
    expect(after.runs.map((r) => r.status)).toEqual(['stopped', 'stopped', 'done'])
  } finally {
    await shutdown()
  }
})
