import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a Terminal button shows a drawer of shells in the project folder, with tabs to add and close them', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-term-')))
  const dir = join(tmp, 'shop-api')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', SHELL: '/bin/sh' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    const drawer = page.getByRole('region', { name: 'Terminals' })
    const button = page.getByRole('group', { name: 'Terminals' }).getByRole('button', { name: /Terminal/ })

    // Its own strip, apart from the view controls.
    await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: /Terminal/ })).toHaveCount(0)
    await expect(drawer).toBeHidden()
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    // Opening it starts one shell, in the project folder, and the page never grows a scroll bar while the terminal sizes itself.
    const overflow = page.evaluate(
      () =>
        new Promise<number>((done) => {
          const d = document.documentElement
          let worst = 0
          let frames = 0
          const tick = () => {
            worst = Math.max(worst, d.scrollHeight - d.clientHeight, d.scrollWidth - d.clientWidth)
            if (++frames < 90) requestAnimationFrame(tick)
            else done(worst)
          }
          requestAnimationFrame(tick)
        })
    )
    await button.click()
    expect(await overflow).toBe(0)
    await expect(drawer).toBeVisible()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    const tabs = drawer.getByRole('tab')
    await expect(tabs).toHaveCount(1)
    await drawer.locator('.xterm').first().click()
    await page.keyboard.type('pwd')
    await page.keyboard.press('Enter')
    await expect(drawer.locator('.xterm-rows')).toContainText(dir, { timeout: 15_000 })

    // + adds another, and it is the one shown.
    await drawer.getByRole('button', { name: /^New terminal/ }).click()
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(button.locator('.term-count')).toHaveText('2')

    // Hiding keeps both; the count stays on the button, and showing again finds them.
    await drawer.getByRole('button', { name: 'Hide the terminals' }).click()
    await expect(drawer).toBeHidden()
    await expect(button.locator('.term-count')).toHaveText('2')
    await page.keyboard.press('Control+`')
    await expect(drawer).toBeVisible()
    await expect(tabs).toHaveCount(2)

    // Something running makes the tab say so, and closing it asks first.
    await drawer.locator('.xterm').nth(1).click()
    await page.keyboard.type('sleep 60')
    await page.keyboard.press('Enter')
    await expect(tabs.nth(1)).toContainText('sleep', { timeout: 15_000 })
    await expect(tabs.nth(1).locator('.tst.run')).toBeVisible()
    await tabs.nth(1).getByRole('button', { name: /^Close/ }).click()
    await expect(drawer.getByRole('alert')).toContainText('is still running')
    await drawer.getByRole('button', { name: 'Keep' }).click()
    await expect(tabs).toHaveCount(2)
    await tabs.nth(1).getByRole('button', { name: /^Close/ }).click()
    await drawer.getByRole('button', { name: 'Stop and close' }).click()
    await expect(tabs).toHaveCount(1)

    // A shell with nothing running closes at once, and the last one leaves an empty drawer with a way to start another.
    await tabs.nth(0).getByRole('button', { name: /^Close/ }).click()
    await expect(tabs).toHaveCount(0)
    await expect(drawer).toContainText('No terminals in shop-api')
    await expect(button.locator('.term-count')).toHaveCount(0)

    // The terminals of a project come back after the window reloads.
    await drawer.getByRole('button', { name: 'New terminal', exact: true }).click()
    await expect(tabs).toHaveCount(1)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Terminals' }).getByRole('tab')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
