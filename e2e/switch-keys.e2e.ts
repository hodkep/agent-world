import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('keys: Ctrl+Tab steps to the next agent and Ctrl+Shift+Tab back, from the message box, and Cmd+arrow is left to the text', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-switch-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'bob' })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = (name: string) => page.getByRole('textbox', { name: `Message ${name}` })
    await expect(box('bob')).toBeVisible()
    await box('bob').click()
    await page.keyboard.press('Control+Tab')
    await expect(box('ada')).toBeVisible()
    await page.keyboard.press('Control+Shift+Tab')
    await expect(box('bob')).toBeVisible()
    await page.keyboard.press('Control+Tab')
    await expect(box('ada')).toBeVisible()
    // Cmd+arrow is the text's: in the message box it moves the caret and changes nothing else.
    await box('ada').fill('one two three')
    await page.keyboard.press('Meta+ArrowLeft')
    await page.keyboard.type('X')
    await expect(box('ada')).toHaveAttribute('data-text', 'Xone two three')
    await expect(box('ada')).toBeVisible()
  } finally {
    await shutdown()
  }
})
