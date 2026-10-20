import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('scrolling up a little from the end leaves it: a row that changes size does not pull the view back, and scrolling back down follows again', async () => {
  test.setTimeout(120_000)
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-scrollaway-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, '**Checks.** All update e2e pass, including a new one.\n\nParagraph 1: the migration runs in three steps.\n\nParagraph 2: the migration runs in three steps.\n\nParagraph 3: the migration runs in three steps.\n\nParagraph 4: the migration runs in three steps.\n\nParagraph 5: the migration runs in three steps.\n\nParagraph 6: the migration runs in three steps.\n\nParagraph 7: the migration runs in three steps.\n\n| PR | What |\n| - | - |\n| #1 | change number 1 with some words |\n| #2 | change number 2 with some words |\n| #3 | change number 3 with some words |\n| #4 | change number 4 with some words |\n| #5 | change number 5 with some words |\n| #6 | change number 6 with some words |\n\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 700, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const log = page.getByRole('log', { name: /Conversation with/ })
    for (let i = 1; i <= 6; i++) {
      await box.fill(`msg ${i}`)
      await box.press('Enter')
      await expect(log.locator('.msg.assistant').nth(i - 1)).toBeVisible({ timeout: 30_000 })
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(2000)
    const gap = () => log.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight))
    // A row's content grows by a few pixels, as a late-measured one does.
    const grow = () => log.evaluate((el) => { const r = el.lastElementChild as HTMLElement; const d = document.createElement('div'); d.style.height = '3px'; r.appendChild(d) })
    await expect.poll(gap).toBeLessThan(2)

    // A little way up, well inside the last 80 pixels: growing a row leaves the view where it is.
    await log.hover()
    await page.mouse.wheel(0, -30)
    await expect.poll(gap).toBe(30)
    await grow()
    await page.waitForTimeout(500)
    expect(await gap()).toBe(33)

    // Back at the end by scrolling down: the view follows again.
    await page.mouse.wheel(0, 60)
    await expect.poll(gap).toBeLessThan(2)
    await grow()
    await expect.poll(gap).toBeLessThan(2)
  } finally {
    await shutdown()
  }
})
