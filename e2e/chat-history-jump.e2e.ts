import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('↑ ↓ walk back through what was sent with the draft kept, and each message of yours has arrows to the one before and after', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-hist-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const log = page.getByRole('log', { name: /Conversation with/ })
    for (const m of ['first thing', 'second thing', 'third thing']) {
      await box.fill(m)
      await box.press('Enter')
      await expect(log.locator('.msg.user', { hasText: m })).toBeVisible({ timeout: 15_000 })
      await expect(box).toHaveValue('')
    }
    // The messages are the saved ones (they have Rewind), not still the rows shown while sending: when the transcript has them the rows are drawn again as new elements,
    // and the arrows of a new element know nothing until the pointer enters it, which on a slow machine happens in the middle of the walk below.
    await expect(log.locator('.msg.user').getByRole('button', { name: 'Rewind' })).toHaveCount(3, { timeout: 30_000 })

    // A draft is typed, then ↑ goes back through what was sent, ↓ comes forward, and the draft is still there at the end.
    await box.fill('my half-written draft')
    await box.press('Control+a')
    await box.press('Home')
    await box.press('ArrowUp')
    await expect(box).toHaveValue('third thing')
    await expect(page.getByRole('status').filter({ hasText: 'history 1 of 3' })).toBeVisible()
    await box.press('ArrowUp')
    await expect(box).toHaveValue('second thing')
    await box.press('ArrowDown')
    await box.press('ArrowDown')
    await expect(box).toHaveValue('my half-written draft')
    await expect(page.getByText(/history \d of 3/)).toHaveCount(0)
    // Esc leaves the walk at once, instead of reaching the agent.
    await box.press('Home')
    await box.press('ArrowUp')
    await box.press('ArrowUp')
    await expect(box).toHaveValue('second thing')
    await box.press('Escape')
    await expect(box).toHaveValue('my half-written draft')
    // In a message with several lines the arrows still move the caret first.
    await box.fill('line one\nline two')
    await box.press('ArrowUp')
    await expect(box).toHaveValue('line one\nline two')
    await box.fill('')

    // Arrows beside each message of yours jump to the one before and after, and the ends are disabled.
    const mine = log.locator('.msg.user')
    await mine.nth(1).hover()
    await expect(mine.nth(1).getByRole('button', { name: 'Previous message you sent' })).toBeEnabled()
    // Short or long, the arrows are a small stack just outside the message's left edge (not the "Latest" button's box).
    for (let i = 0; i < 3; i++) {
      await mine.nth(i).hover()
      const msg = (await mine.nth(i).boundingBox())!
      const up = (await mine.nth(i).getByRole('button', { name: 'Previous message you sent' }).boundingBox())!
      const down = (await mine.nth(i).getByRole('button', { name: 'Next message you sent' }).boundingBox())!
      expect(up.x + up.width).toBeLessThanOrEqual(msg.x + 1)
      expect(up.width).toBeLessThan(40)
      expect(down.y).toBeGreaterThan(up.y)
      expect(down.y + down.height).toBeLessThanOrEqual(msg.y + msg.height + 1)
      // They fade in under the pointer, and are hidden otherwise.
      await expect(mine.nth(i).locator('.msg-jump')).toHaveCSS('opacity', '1')
    }
    await mine.nth(1).getByRole('button', { name: 'Previous message you sent' }).click()
    await expect(mine.nth(0)).toHaveClass(/jumped/)
    await mine.nth(0).hover()
    await expect(mine.nth(0).getByRole('button', { name: 'Previous message you sent' })).toBeDisabled()
    await mine.nth(2).hover()
    await expect(mine.nth(2).getByRole('button', { name: 'Next message you sent' })).toBeDisabled()
    await mine.nth(0).getByRole('button', { name: 'Next message you sent' }).click({ force: true })
    await expect(mine.nth(1)).toHaveClass(/jumped/)
    // Alt+↓ does the same from the keyboard.
    await log.press('Alt+ArrowDown')
    await expect(mine.nth(2)).toHaveClass(/jumped/)
  } finally {
    await shutdown()
  }
})
