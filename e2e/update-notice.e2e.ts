import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const RELEASE = 'https://github.com/hodkep/agent-world/releases/tag/v0.2.0'

test('a newer version that the app cannot install itself is a chip in the top bar and a button in Settings, and both open its release page', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-update-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    // The browser is a stand-in: record what would have been opened.
    await app.evaluate(({ shell }) => {
      ;(globalThis as unknown as { opened: string[] }).opened = []
      shell.openExternal = async (u: string) => void (globalThis as unknown as { opened: string[] }).opened.push(u)
    })
    const opened = () => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)
    const tell = (s: object) => app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0]!.webContents.send('update-state', state), s)

    // Nothing is out: nothing is shown.
    await expect(page.locator('header').getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /is available/ })).toHaveCount(0)

    await tell({ state: 'available', detail: '0.2.0 is available.', latest: '0.2.0', url: RELEASE })
    const chip = page.locator('header').getByRole('button', { name: 'Agent World 0.2.0 is available: open its page' })
    await expect(chip).toContainText('0.2.0')
    await chip.click()
    await expect.poll(opened).toEqual([RELEASE])

    // Settings says the same, with a button beside Check now.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Updates/ }).click()
    await expect(settings.getByRole('status')).toContainText('0.2.0 is available.')
    await expect(settings).toContainText('cannot install the new version itself')
    await settings.getByRole('button', { name: 'Open the release page' }).click()
    await expect.poll(opened).toEqual([RELEASE, RELEASE])
    await settings.getByRole('button', { name: 'Close settings' }).click()

    // Once the app is the new version there is nothing newer, and the chip goes.
    await tell({ state: 'none' })
    await expect(chip).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('a version the app installs itself is not a chip: it is said in Settings and installs when the app quits', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-update-ready-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    await expect(page.locator('header').getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.send('update-state', { state: 'ready', detail: '0.2.0 is ready; it installs when you quit.' }))
    await expect(page.getByRole('button', { name: /is available/ })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
