import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the first questions of a new Claude Code are answered in the chat, with no Cancel where Esc does nothing, and the one that needs a browser says to use the terminal and stays until it is gone', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-firstrun-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_ONBOARDING: '1' },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.getByRole('region', { name: 'ada is waiting for you' })

    // The text style list has no numbers; it is offered with its choices, and no Cancel, which would press an Esc that does nothing.
    await expect(card).toContainText('Choose the text style that looks best with your terminal', { timeout: 20_000 })
    await expect(card.getByRole('button', { name: 'Light mode' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Answer in terminal' })).toBeVisible()

    // A choice moves the terminal's cursor to it and confirms, and the next question comes up in the same place.
    await card.getByRole('button', { name: 'Light mode' }).click()
    await expect(card).toContainText('Select login method', { timeout: 20_000 })
    await expect(card.getByRole('button', { name: /Claude account with subscription/ })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Cancel' })).toHaveCount(0)

    // Closing the card leaves a strip that brings it back, and it brings it back.
    await card.getByRole('button', { name: 'Close (Esc)' }).click()
    const strip = page.getByRole('status').filter({ hasText: 'ada is waiting for you' })
    await expect(strip).toBeVisible()
    await strip.getByRole('button', { name: 'Show' }).click()
    await expect(card).toContainText('Select login method')

    // Signing in needs the browser and a code pasted in the terminal: the card says so, has no choices, and opens the terminal.
    await card.getByRole('button', { name: /Claude account with subscription/ }).click()
    await expect(card).toContainText('Sign in to Claude Code', { timeout: 20_000 })
    await expect(card.getByRole('button', { name: 'Open terminal' })).toBeVisible()
    await expect(card.getByRole('button', { name: /Claude account/ })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
    // It does not go away while the screen is still there: close it and the strip stays, however long the screen stays.
    await card.getByRole('button', { name: 'Close (Esc)' }).click()
    await page.waitForTimeout(2500)
    await expect(strip).toBeVisible()
    await strip.getByRole('button', { name: 'Show' }).click()
    await card.getByRole('button', { name: 'Open terminal' }).click()
    await expect(page.getByRole('tab', { name: 'Terminal', selected: true })).toBeVisible()
  } finally {
    await shutdown()
  }
})
