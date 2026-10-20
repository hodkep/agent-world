import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

test('a dialog Claude shows itself even after you allowed the tool appears in the chat, and can be answered there', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-own-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_OWN_DIALOG: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    await page.getByRole('form', { name: 'Hire an agent' }).getByRole('button', { name: 'Hire' }).click()
    const ask = page.getByRole('region', { name: 'ada is waiting for you' })
    await ask.getByRole('button', { name: 'Allow' }).click({ timeout: SLOW })
    // Claude still wants its own confirmation: it shows up here, with its options as buttons.
    await expect(ask).toContainText('Bash command', { timeout: SLOW })
    await expect(ask).toContainText('command_substitution')
    await ask.getByRole('button', { name: 'No', exact: true }).click()
    await expect(ask).toHaveCount(0, { timeout: SLOW })
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('chose option 2')
  } finally {
    await shutdown()
  }
})

test('rewind a conversation from a message in the chat', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-rew-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    for (const t of ['first thing', 'second thing']) {
      await box.fill(t)
      await box.press('Enter')
      await expect(log.locator('.msg.assistant').last()).toContainText(t, { timeout: SLOW })
      await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toHaveCount(0, { timeout: SLOW })
    }
    const first = log.locator('.msg.user', { hasText: 'first thing' })
    await first.hover()
    await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
    await first.getByRole('button', { name: 'Copy' }).click()
    await expect(first.getByRole('button', { name: 'Copied' })).toBeVisible()
    await first.getByRole('button', { name: 'Rewind' }).click()
    const ask = page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(ask).toContainText('first thing', { timeout: SLOW })
    await ask.getByRole('button', { name: 'Restore conversation' }).click()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('rewound to: first thing (option 1)')
    await page.getByRole('tab', { name: 'Chat' }).click()
    // The rewound messages leave the conversation and the prompt is back in the composer.
    await expect(box).toHaveValue('first thing', { timeout: SLOW })
    await expect(log.locator('.msg.user')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('your own numbered message on the terminal screen is not offered as a menu, and nothing is stuck after a reload', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-echo-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_ECHO_LIST: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    await page.getByRole('form', { name: 'Hire an agent' }).getByRole('button', { name: 'Hire' }).click()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('I mean sub-agent only', { timeout: SLOW })
    // A real menu shows up within a second of staying on screen; give this one three.
    await page.waitForTimeout(3000)
    await expect(page.getByRole('region', { name: 'ada is waiting for you' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('I mean sub-agent only', { exact: true })).toHaveCount(0) // the terminal text is drawn on a canvas, so a button with it would be a menu
    await page.reload()
    await page.waitForTimeout(3000)
    await expect(page.getByRole('region', { name: 'ada is waiting for you' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('rewind with nothing to go back to says so in words and leaves Claude ready', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-rew-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_REWIND_EMPTY: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await box.fill('only thing')
    await box.press('Enter')
    await expect(log.locator('.msg.assistant').last()).toContainText('only thing', { timeout: SLOW })
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toHaveCount(0, { timeout: SLOW })
    const msg = log.locator('.msg.user', { hasText: 'only thing' })
    await msg.hover()
    await msg.getByRole('button', { name: 'Rewind' }).click()
    await expect(page.getByText(/nothing to rewind to yet/i)).toBeVisible({ timeout: SLOW })
    await expect(page.getByText(/Try \/rewind in the Terminal tab/)).toHaveCount(0)
    // Claude's own box was closed, so the terminal is ready again.
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).not.toContainText('Nothing to rewind to yet')
  } finally {
    await shutdown()
  }
})
