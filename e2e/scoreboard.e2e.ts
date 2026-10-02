import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a sign on the lawn lists who has changed the most lines, once anyone has', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-score-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_COST: '1.5' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })
    const rows = async () => JSON.parse((await page.locator('.stage').getAttribute('data-scoreboard')) ?? '[]') as { name: string; lines: number; pct: number }[]
    // Each fake agent reports 12 lines added and 3 removed.
    await expect.poll(async () => (await rows()).length, { timeout: 20_000 }).toBe(2)
    expect(await rows()).toEqual([{ name: 'ADA', lines: 15, pct: 100 }, { name: 'LINUS', lines: 15, pct: 100 }])
  } finally {
    await shutdown()
  }
})
