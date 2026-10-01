import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start(extra: Record<string, string> = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-polish-')))
  const dir = join(home, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const run = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', ...extra }, home)
  const page = await run.app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  return { ...run, page }
}

test('the conversation stays pinned to its end, with room below the last message', async () => {
  const { page, shutdown } = await start({ FAKE_LONG: '120' })
  try {
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('old message 119')).toBeVisible({ timeout: 10_000 })
    const gapToEnd = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)
    await expect.poll(gapToEnd).toBeLessThan(2)
    // The last message does not sit on the edge of the box: there is a clear gap, as in Claude's own app.
    const room = await log.evaluate((el) => {
      const last = [...el.querySelectorAll('.msg')].at(-1)!.getBoundingClientRect()
      return el.getBoundingClientRect().bottom - last.bottom
    })
    expect(room).toBeGreaterThanOrEqual(24)
    // A new message and its answer keep it at the end.
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.fill('one more thing')
    await box.press('Enter')
    await expect(log.getByText('one more thing')).toBeVisible({ timeout: 10_000 })
    await expect.poll(gapToEnd).toBeLessThan(2)
  } finally {
    await shutdown()
  }
})

test('hiring opens a dialog over the office and Esc closes it', async () => {
  const { page, shutdown } = await start()
  try {
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const dialog = page.getByRole('dialog', { name: 'Hire an agent dialog' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('form', { name: 'Hire an agent' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // Hiring from it still works.
    await hire(page)
    await expect(page.locator('.roster button', { hasText: 'ada' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('text opens a step or two larger than the default, and the test setting turns that off', async () => {
  const big = await start({ AW_ZOOM: '' })
  try {
    expect(await big.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBeCloseTo(1.2, 5)
  } finally {
    await big.shutdown()
  }
  const plain = await start()
  try {
    expect(await plain.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(1)
  } finally {
    await plain.shutdown()
  }
})
