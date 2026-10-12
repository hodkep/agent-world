import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('jumping between your messages lands each one in the middle, even past tall replies that were not drawn yet', async () => {
  test.setTimeout(120_000)
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-settle-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const tall = join(tmp, 'tall.md')
  writeFileSync(tall, `# Long answer\n\n${Array.from({ length: 60 }, (_, i) => `- line ${i}: words to make this reply tall`).join('\n')}\n`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: tall }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const log = page.getByRole('log', { name: /Conversation with/ })
    const N = 8
    for (let i = 1; i <= N; i++) {
      await box.fill(`msg ${i}`)
      await box.press('Enter')
      await page.waitForTimeout(i % 3 === 0 ? 1500 : 350)
    }
    await expect(log.locator('.msg.user', { hasText: `msg ${N}` })).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(2000)

    // Which of your messages is in the middle once the scrolling has stopped, and how far from the middle.
    const middle = async () => {
      let last = -1
      for (let same = 0; same < 4; ) {
        const now = await log.evaluate((l) => l.scrollTop)
        same = now === last ? same + 1 : 0
        last = now
        await page.waitForTimeout(100)
      }
      return log.evaluate((l) => {
        const mid = l.getBoundingClientRect().top + l.clientHeight / 2
        const mine = [...l.querySelectorAll<HTMLElement>('[data-user-msg]')]
        const off = mine.map((m) => Math.abs((m.getBoundingClientRect().top + m.getBoundingClientRect().bottom) / 2 - mid))
        const at = off.indexOf(Math.min(...off))
        return { at, off: Math.round(off[at]!) }
      })
    }
    await box.press('Alt+ArrowUp')
    expect((await middle()).at).toBe(N - 1)
    for (let want = N - 2; want >= 0; want--) {
      await log.press('Alt+ArrowUp')
      expect(await middle(), `going up to message ${want + 1}`).toEqual({ at: want, off: expect.any(Number) })
      expect((await middle()).off).toBeLessThan(6)
    }
    for (let want = 1; want < N; want++) {
      await log.press('Alt+ArrowDown')
      const m = await middle()
      expect(m.at, `going down to message ${want + 1}`).toBe(want)
      expect(m.off).toBeLessThan(6)
    }
  } finally {
    await shutdown()
  }
})
