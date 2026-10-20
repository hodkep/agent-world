import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('files an agent names are links that open as a page, a document, code or an offer to use the default app', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-files-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_FILES: '1' },
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
    await box.fill('make some files')
    await box.press('Enter')
    const reply = log.locator('.msg.assistant').filter({ hasText: 'I made' })

    // Real files become links named after the file; a web address and a missing file stay as written.
    await expect(reply.locator('a.file-link')).toHaveText(['report.html', 'notes.md', 'deck.pptx', 'tool.ts'], { timeout: 15_000 })
    await expect(reply).toContainText('https://example.com/docs/page.html')
    await expect(reply).toContainText('missing/nothing.md')
    await expect(reply).not.toContainText(home)

    // A markdown file opens in the File tab, rendered; selecting words offers to add them to the message.
    await reply.getByRole('link', { name: 'notes.md' }).click()
    const fileTab = page.getByRole('tab', { name: 'notes.md', selected: true })
    await expect(fileTab).toBeVisible()
    await expect(page.locator('.fileview .md strong')).toHaveText('ship')
    await page.locator('.fileview .md p').selectText()
    await page.locator('.fileview-body').dispatchEvent('mouseup')
    // The key does what the button does.
    await expect(page.getByRole('button', { name: 'Add selection to message' })).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Attached files' })).toContainText('notes.md, selection')

    // A file the app cannot show says so and offers the machine's own program.
    await page.getByRole('tab', { name: 'Chat' }).click()
    await reply.getByRole('link', { name: 'deck.pptx' }).click()
    await expect(page.locator('.fileview-other')).toContainText("can't be shown here")
    await expect(page.getByRole('button', { name: 'Open with default application' })).toBeVisible()

    // Code outside a branch is shown in the File tab, highlighted.
    await page.getByRole('tab', { name: 'Chat' }).click()
    await reply.getByRole('link', { name: 'tool.ts' }).click()
    await expect(page.locator('.fileview-code')).toContainText('export const answer = 42')

    // A page opens in the Preview tab, where its elements can be picked.
    await page.getByRole('tab', { name: 'Chat' }).click()
    await reply.getByRole('link', { name: 'report.html' }).click()
    await expect(page.getByRole('tab', { name: /Preview/, selected: true })).toBeVisible()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> }).executeJavaScript(c), code)
    // The page may not have loaded yet; keep asking until it answers.
    await expect.poll(() => run('document.body.innerText').catch(() => ''), { timeout: 15_000 }).toContain('Quarterly report')
    await page.getByRole('button', { name: 'Select element' }).click()
    await run("const b = document.querySelector('#go').getBoundingClientRect(); const at = { clientX: b.left + 5, clientY: b.top + 5, bubbles: true }; window.dispatchEvent(new MouseEvent('mousemove', at)); window.dispatchEvent(new MouseEvent('click', at))")
    await expect(page.getByRole('list', { name: 'Attached files' })).toContainText('button on report.html', { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
