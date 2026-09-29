import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('after /clear gives the conversation a new session id, the agent keeps its identity and resume follows it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-id-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CLEAR: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('button', { name: 'Approve' }).click({ timeout: 15_000 })
    const row = page.locator('.roster button').first()
    // The post-/clear Grep arrives under the new session id and still moves this agent.
    await expect(row).toContainText('researching', { timeout: 10_000 })
    await expect(page.locator('.agent-head')).toContainText('after-clear')
    const [saved] = JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))
    expect(saved.sessionId).toMatch(/^cleared-/)
  } finally {
    await shutdown()
  }
})
