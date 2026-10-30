import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// The office adds a line to a request while workflows are on and the agent has no task open, so the agent is asked again to announce it.
async function run(workflows: boolean) {
  const home = mkdtempSync(join(tmpdir(), 'aw-wfrem-'))
  mkdirSync(join(home, 'aw'), { recursive: true })
  writeFileSync(join(home, 'aw', 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: workflows, dial: 'balanced', since: 1 } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_SHOW_REMINDER: '1' }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
  await page.reload()
  await hire(page)
  return { page, shutdown }
}

test('with workflows on, a turn with no task open is reminded to call task_begin', async () => {
  const { page, shutdown } = await run(true)
  try {
    await expect(page.locator('.term-host:visible')).toContainText('REMINDER: Before acting: if this request changes code', { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('with workflows off, nothing about tasks is added to the request', async () => {
  const { page, shutdown } = await run(false)
  try {
    await expect(page.locator('.term-host:visible')).toContainText('REMINDER:', { timeout: 15_000 })
    await expect(page.locator('.term-host:visible')).not.toContainText('task_begin')
  } finally {
    await shutdown()
  }
})
