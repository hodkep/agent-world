import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatMenu, hire, launchApp } from './launch'

test('Save notes writes a record of the conversation outside the project', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-notes-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('add a health check')
    await box.press('Enter')
    await expect(page.getByRole('log').locator('.tc', { hasText: 'Edited' })).toBeVisible({ timeout: 10_000 })
    await chatMenu(page, 'Save notes')
    await expect(page.getByRole('status').filter({ hasText: 'Notes saved' })).toBeVisible()
    const dir = join(home, 'aw', 'notes')
    const [slug] = readdirSync(dir)
    const [file] = readdirSync(join(dir, slug!))
    const md = readFileSync(join(dir, slug!, file!), 'utf8')
    expect(md).toContain('1. add a health check')
    expect(md).toContain('Files changed')
  } finally {
    await shutdown()
  }
})
