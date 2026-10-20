import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatMenu, hire, launchApp } from './launch'
import { SLOW } from './waits'

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
    // A command is folded to its headline until clicked; clicking again folds it.
    const cmd = log.locator('.tc', { hasText: 'List the source folder' })
    await expect(cmd).toBeVisible({ timeout: SLOW })
    await expect(cmd).not.toContainText('$ ls src')
    await cmd.getByRole('button', { name: /List the source folder/ }).click()
    await expect(cmd).toContainText('$ ls src')
    await expect(cmd).toContainText('health.ts')
    await cmd.getByRole('button', { name: /List the source folder/ }).click()
    await expect(cmd).not.toContainText('$ ls src')
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
    await expect(log.locator('.pic img').first()).toBeVisible({ timeout: SLOW })
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
    const lightbox = page.getByRole('dialog', { name: 'Picture' })
    await expect(lightbox).toBeVisible()
    // Shown whole inside the window, then it zooms in and out and goes back to fitting.
    const fits = () => lightbox.locator('img').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth })
    expect(await fits()).toBe(true)
    await lightbox.getByRole('button', { name: 'Zoom in' }).click()
    await expect(lightbox.locator('.lightbox-bar span')).toHaveText('125%')
    await page.keyboard.press('+')
    await expect(lightbox.locator('.lightbox-bar span')).toHaveText('156%')
    await lightbox.getByRole('button', { name: 'Fit to window' }).click()
    await expect(lightbox.locator('.lightbox-bar span')).toHaveText('Fit')
    expect(await fits()).toBe(true)
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
    await expect(page.locator('.mode-chip')).toHaveText('Edit automatically', { timeout: SLOW })
    // Jumping two steps ahead presses Shift+Tab twice, reading the footer each time.
    await page.locator('.mode-chip').click()
    await page.getByRole('menuitemradio', { name: /^Ask first/ }).click()
    await expect(page.locator('.mode-chip')).toHaveText('Ask first', { timeout: SLOW })
    await page.locator('.mode-chip').click()
    await page.getByRole('menuitemradio', { name: /^Plan/ }).click()
    await expect(page.locator('.mode-chip')).toHaveText('Plan', { timeout: SLOW })

    // Search marks every match in the conversation, which stays whole, and steps from one to the next.
    await box.fill('')
    await chatMenu(page, 'Search')
    const find = page.getByRole('textbox', { name: 'Search this conversation' })
    await find.fill('e')
    const marked = () => page.evaluate(() => [CSS.highlights.get('find')?.size ?? 0, CSS.highlights.get('find-current')?.size ?? 0])
    await expect.poll(async () => (await marked())[0]).toBeGreaterThan(1)
    expect((await marked())[1]).toBe(1)
    await expect(log.locator('.msg.shell')).toBeVisible()
    await expect(log.locator('.msg.assistant').first()).toBeVisible()
    const count = page.locator('.chat-count')
    const total = Number((await count.textContent())!.split(' of ')[1])
    expect(total).toBeGreaterThan(2)
    expect(await count.textContent()).toBe(`${total} of ${total}`)
    await find.press('Enter')
    await expect(count).toHaveText(`${total - 1} of ${total}`)
    await page.getByRole('button', { name: 'Next match' }).click()
    await expect(count).toHaveText(`${total} of ${total}`)
    await page.getByRole('button', { name: 'Next match' }).click()
    await expect(count).toHaveText(`1 of ${total}`)
    await find.fill('zzzz-nothing')
    await expect(count).toHaveText('No matches')
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
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toBeVisible({ timeout: SLOW })
    // While it works, a typed message can wait its turn or be sent right now.
    await box.fill('actually, stop and do this instead')
    await expect(page.getByRole('button', { name: 'Send now' })).toBeVisible()
    await box.fill('')
    // The screen goes quiet with the input box showing: the turn is over.
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toHaveCount(0, { timeout: SLOW })
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
    await expect(page.getByRole('log').locator('.ev-chip')).toContainText('Interrupted')

    // A new message now goes straight in, not into a queue.
    await box.fill('try again')
    await box.press('Enter')
    await expect(page.getByRole('log').locator('.msg.user .msg-meta')).not.toContainText('Queued')
  } finally {
    await shutdown()
  }
})

test('a wide picture sits in a frame no wider than itself, and a command card has a copy button and coloured text', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-frame-'))
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
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    // A 1600 x 500 picture: far wider than the 320px it is shown at.
    const wide = await page.evaluate(async () => {
      const c = document.createElement('canvas')
      c.width = 1600
      c.height = 500
      const g = c.getContext('2d')!
      g.fillStyle = '#336'
      g.fillRect(0, 0, 1600, 500)
      return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))).arrayBuffer()))
    })
    await page.locator('.composer input[type=file]').setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: Buffer.from(wide) })
    await box.fill('add a health check')
    await box.press('Enter')
    const pic = log.locator('.msg.user .pic').first()
    await expect(pic.locator('img')).toBeVisible({ timeout: SLOW })
    await expect.poll(async () => Math.abs((await pic.boundingBox())!.width - (await pic.locator('img').boundingBox())!.width)).toBeLessThan(6)

    // The command card: a title, a copy button, and colour in the command.
    const card = log.locator('.tc', { hasText: 'List the source folder' })
    await card.getByRole('button', { name: /List the source folder/ }).click({ timeout: SLOW })
    await expect(card).toContainText('$ ls src')
    await expect(card.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(1)
    await expect(card.locator('.tc-cmd code span[class*="mtk"]').first()).toBeVisible({ timeout: SLOW })
  } finally {
    await shutdown()
  }
})

test('tool lookups are one quiet line and MCP calls read as a sentence, with details on demand', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-mcp-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_MCP: '1' },
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
    await box.fill('look at the site')
    await box.press('Enter')

    // Steps that follow one another fold into a group once done; open it to see them.
    const head = log.locator('.sg-head').first()
    await expect(head).toBeVisible({ timeout: SLOW })
    if ((await head.getAttribute('aria-expanded')) === 'false') await head.click()
    // Tool lookup: a line with a chip per tool, no JSON.
    const line = log.locator('.tc-line')
    await expect(line).toContainText('Loaded 2 tools', { timeout: SLOW })
    await expect(line.locator('.chip')).toHaveText(['playwright navigate', 'playwright snapshot'])
    await expect(line).not.toContainText('{')

    // MCP call: server badge, a verb and the address as a link; details are folded.
    const card = log.locator('.tc', { hasText: 'Opened' })
    await expect(card.locator('.srv-badge')).toHaveText('playwright')
    await expect(card.getByRole('link', { name: 'experts.snorkel-ai.com/home' })).toBeVisible()
    await expect(card).toContainText('Snorkel AI Experts Portal')
    await expect(card.locator('.kv')).toHaveCount(0)
    await card.getByRole('button', { name: 'Details' }).click()
    await expect(card.locator('.kv')).toContainText('url')
    await expect(card.locator('.tc-sec h4').first()).toHaveText('Ran Playwright code')
    // The result's markdown symbols are not shown raw.
    await expect(card.locator('.tc-result')).not.toContainText('###')
    await expect(card.locator('.tc-result')).not.toContainText('```')
  } finally {
    await shutdown()
  }
})

test('a message sent while the agent is busy is shown as queued, and stays in the chat after the agent picks it up', async () => {
  test.setTimeout(120_000)
  const home = mkdtempSync(join(tmpdir(), 'aw-queue-'))
  // Each tool step takes ~22s here, longer than the 20s a sent message used to be kept on screen.
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '7500', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_QUEUE: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log')
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('first job')
    await box.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'ada is' })).toBeVisible({ timeout: SLOW })
    // The chat shows it working as soon as it is sent; the second message waits until the agent has really taken the first (its first tool step shows).
    await expect(page.locator('.live-detail')).toBeVisible({ timeout: SLOW })
    await box.fill('second job')
    await box.press('Enter')
    const second = log.locator('.msg.user', { hasText: 'second job' })
    await expect(second.locator('.msg-meta')).toHaveText('Queued: sends when the agent finishes its current step')

    // Still there after the old 20 s cut-off, while the agent has not got to it.
    await page.waitForTimeout(21_000)
    await expect(second).toBeVisible()
    // Once the agent picks it up it is an ordinary message of yours, and it stays.
    await expect(log.locator('.msg.assistant', { hasText: 'Picked up "second job"' })).toBeVisible({ timeout: SLOW })
    await expect(second.locator('.msg-meta')).toHaveCount(0)
    await expect(log.locator('.msg.user', { hasText: 'second job' })).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
