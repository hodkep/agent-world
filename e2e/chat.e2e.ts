import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatMenu, hire, launchApp } from './launch'

test('chat with an agent: send a prompt, watch tools and the reply appear, slash commands complete', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-chat-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()

    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('/comp')
    await expect(page.getByRole('option', { name: /\/compact/ })).toBeVisible()
    await box.fill('')

    await box.fill('add a health check')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.user')).toContainText('add a health check')
    await expect(log.locator('.tc', { hasText: 'List the source folder' })).toContainText('$ ls src', { timeout: 10_000 })
    await expect(log.locator('.tc', { hasText: 'List the source folder' })).toContainText('health.ts')
    await expect(log.locator('.tc', { hasText: 'Edited' })).toContainText('export const ok = true')
    await expect(log.locator('.msg.assistant strong')).toHaveText('health.ts')
    await expect(log.locator('.msg.assistant li')).toHaveCount(2)
    // The optimistic bubble was replaced by the real one, not duplicated.
    await expect(log.locator('.msg.user')).toHaveCount(1)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'chat.png') })

    // The same conversation is still there after switching views.
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('fake claude')
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(log.locator('.msg.assistant')).toBeVisible()
  } finally {
    await shutdown()
  }
})

// A 1x1 red PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')

test('attach and paste pictures, run a shell command with !, switch permission mode, search the conversation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-chat2-'))
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

    // Attach through the picker: a chip with a preview, removable, then sent with the message.
    await page.locator('.composer input[type=file]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG })
    const chips = page.getByRole('list', { name: 'Attached files' })
    await expect(chips).toContainText('shot.png')
    await box.fill('what is in this picture?')
    await box.press('Enter')
    await expect(log.locator('.msg.user .bubble').first()).toContainText('what is in this picture?')
    await expect(log.locator('.pic img').first()).toBeVisible({ timeout: 10_000 })
    await expect(chips).toHaveCount(0)

    // Paste a picture from the clipboard.
    await box.focus()
    await page.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }))
      document.querySelector('textarea')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, PNG.toString('base64'))
    await expect(chips).toContainText('image.png')
    await page.getByRole('button', { name: 'Remove image.png' }).click()
    await expect(chips).toHaveCount(0)

    // A picture opens full size.
    await log.locator('.pic').first().click()
    await expect(page.getByRole('dialog', { name: 'Picture' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Picture' })).toHaveCount(0)

    // Shell mode: the composer says so, and the command and its output appear as a shell card.
    await box.fill('!git status')
    await expect(page.locator('.shell-badge')).toBeVisible()
    await box.press('Enter')
    await expect(log.locator('.msg.shell')).toContainText('git status')
    await expect(log.locator('.msg.shell')).toContainText('nothing to commit')

    // Permission mode: click the chip (Shift+Tab) and the label follows what Claude reports.
    await expect(page.locator('.mode-chip')).toHaveText('Ask first')
    await page.locator('.mode-chip').click()
    await page.getByRole('menuitemradio', { name: /^Edit automatically/ }).click()
    await expect(page.locator('.mode-chip')).toHaveText('Edit automatically', { timeout: 10_000 })
    // Jumping two steps ahead presses Shift+Tab twice, reading the footer each time.
    await page.locator('.mode-chip').click()
    await page.getByRole('menuitemradio', { name: /^Ask first/ }).click()
    await expect(page.locator('.mode-chip')).toHaveText('Ask first', { timeout: 10_000 })
    await page.locator('.mode-chip').click()
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click()
    await expect(page.locator('.mode-chip')).toHaveText('Plan', { timeout: 10_000 })

    // Search narrows the conversation.
    await box.fill('')
    await chatMenu(page, 'Search')
    await page.getByRole('textbox', { name: 'Search this conversation' }).fill('git status')
    await expect(log.locator('.msg.shell')).toBeVisible()
    await expect(log.locator('.msg.assistant')).toHaveCount(0)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'chat2.png') })
  } finally {
    await shutdown()
  }
})

test('after Esc interrupts a turn (Claude sends no Stop hook) the chat stops saying it is working and sends normally again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-chat3-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_HANG: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('do something long')
    await box.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toBeVisible({ timeout: 10_000 })
    // While it works, a typed message can wait its turn or be sent right now.
    await box.fill('actually, stop and do this instead')
    await expect(page.getByRole('button', { name: 'Send now' })).toBeVisible()
    await box.fill('')
    // The screen goes quiet with the input box showing: the turn is over.
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
    await expect(page.getByRole('log').locator('.msg.note')).toContainText('Interrupted')

    // A new message now goes straight in, not into a queue.
    await box.fill('try again')
    await box.press('Enter')
    await expect(page.getByRole('log').locator('.msg.user .msg-meta')).not.toContainText('queued')
  } finally {
    await shutdown()
  }
})
