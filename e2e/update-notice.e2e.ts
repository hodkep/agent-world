import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const RELEASE = 'https://github.com/hodkep/agent-world/releases/tag/v0.2.0'

test('a newer version for a build that has no way to download it is a chip that opens a popover with its release page, and the same button in Settings', async () => {
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
    const chip = page.locator('header').getByRole('button', { name: 'Agent World 0.2.0 is available' })
    await expect(chip).toContainText('0.2.0')
    // The chip opens a popover; nothing opens in the browser until the button in it is pressed (this state has no tag, so there is no download to offer).
    await chip.click()
    expect(await opened()).toEqual([])
    await page.getByRole('dialog', { name: 'Agent World update' }).getByRole('button', { name: 'Open the release page' }).click()
    await expect.poll(opened).toEqual([RELEASE])
    await page.keyboard.press('Escape')

    // Settings says the same, with a button beside Check now.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Updates/ }).click()
    await expect(settings.getByRole('status')).toContainText('0.2.0 is available.')
    await expect(settings).toContainText('not signed with an Apple Developer ID')
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

test('a copy installed with Homebrew is told the command to run, with a Copy button and no download or install, in the popover and in Settings', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-update-brew-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ shell }) => {
      ;(globalThis as unknown as { opened: string[] }).opened = []
      shell.openExternal = async (u: string) => void (globalThis as unknown as { opened: string[] }).opened.push(u)
    })
    const tell = (s: object) => app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0]!.webContents.send('update-state', state), s)
    await expect(page.locator('header').getByRole('button', { name: 'Settings', exact: true })).toBeVisible()
    await tell({ state: 'available', detail: '0.2.0 is available.', latest: '0.2.0', current: '0.1.9', url: RELEASE, tag: 'v0.2.0', homebrew: true })
    await page.locator('header').getByRole('button', { name: 'Agent World 0.2.0 is available' }).click()
    const pop = page.getByRole('dialog', { name: 'Agent World update' })
    await expect(pop).toContainText('installed with Homebrew')
    await expect(pop).toContainText('brew upgrade --cask hodkep/tap/agent-world')
    await expect(pop.getByRole('button', { name: 'Download' })).toHaveCount(0)
    await expect(pop.getByRole('button', { name: 'Install and restart' })).toHaveCount(0)
    // Copy puts the command on the clipboard.
    await pop.getByRole('button', { name: 'Copy command' }).click()
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('brew upgrade --cask hodkep/tap/agent-world')
    await page.keyboard.press('Escape')

    // Settings says the same.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Updates/ }).click()
    await expect(settings).toContainText('brew upgrade --cask hodkep/tap/agent-world')
    await expect(settings.getByRole('button', { name: 'Download' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('the notes of the new version stay on screen while it downloads, when it is ready and while it installs, in the popover and in Settings', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-update-notes-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, home)
  try {
    const page = await app.firstWindow()
    const tell = (s: object) => app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0]!.webContents.send('update-state', state), s)
    // The notes carry pictures: one from the repository on GitHub (kept, full width, its words under it), one from elsewhere (dropped), and one from the repository that is not there (its words stay in its place).
    const ours = 'https://raw.githubusercontent.com/hodkep/agent-world/0609c319/docs/images/releases/0.6.0'
    const notes = `## What changed\n\n- Tasks can have subtasks\n\n![A task card with its subtasks as a checklist](${ours}/subtasks-labels.png)\n\n![Not ours](https://evil.example/pixel.png)\n\n![A picture that is gone](${ours}/no-such-picture.png)`
    const found = { state: 'available', detail: '0.2.0 is available.', latest: '0.2.0', current: '0.1.0', tag: 'v0.2.0', url: RELEASE, notes }
    const popover = page.getByRole('dialog', { name: 'Agent World update' })
    await expect(page.locator('header').getByRole('button', { name: 'Settings', exact: true })).toBeVisible()

    // Downloading: the bar runs and the notes are under it.
    await tell({ ...found, install: { phase: 'downloading', version: '0.2.0', received: 9 * 1024 * 1024, total: 22 * 1024 * 1024 } })
    await page.locator('header').getByRole('button', { name: 'Downloading 0.2.0' }).click()
    await expect(popover.getByRole('progressbar')).toBeVisible()
    await expect(popover).toContainText("What's new in 0.2.0")
    await expect(popover).toContainText('Tasks can have subtasks')
    const shots = popover.locator('figure.rn-shot')
    await expect(shots).toHaveCount(2)
    await expect(shots.first().locator('img')).toHaveAttribute('src', `${ours}/subtasks-labels.png`)
    await expect(shots.first().locator('figcaption')).toHaveText('A task card with its subtasks as a checklist')
    await expect(popover.locator('img[src*="evil.example"]')).toHaveCount(0)
    await expect(popover).not.toContainText('Not ours')
    // The picture that is not there: once it fails to load, only its words are left, in a box of their own.
    await expect(shots.nth(1)).toHaveClass(/rn-gone/, { timeout: 20_000 })
    await expect(shots.nth(1).locator('img')).toHaveCount(0)
    await expect(shots.nth(1)).toHaveText('A picture that is gone')
    await page.keyboard.press('Escape')

    // Ready to install: still there, as before.
    await tell({ ...found, install: { phase: 'ready', version: '0.2.0', file: '/tmp/x.zip' } })
    await page.locator('header').getByRole('button', { name: 'Agent World 0.2.0 is available' }).or(page.locator('header .update-chip')).first().click()
    await expect(popover).toContainText('Tasks can have subtasks')
    await page.keyboard.press('Escape')

    // Installing: still there, and Settings shows the same.
    await tell({ ...found, install: { phase: 'installing', version: '0.2.0' } })
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Updates/ }).click()
    await expect(settings).toContainText('Installing 0.2.0')
    await expect(settings).toContainText("What's new in 0.2.0")
    await expect(settings).toContainText('Tasks can have subtasks')
    // And back to a download in Settings: the notes do not go.
    await tell({ ...found, install: { phase: 'downloading', version: '0.2.0', received: 1024, total: 22 * 1024 * 1024 } })
    await expect(settings.getByRole('progressbar')).toBeVisible()
    await expect(settings).toContainText('Tasks can have subtasks')
  } finally {
    await shutdown()
  }
})

