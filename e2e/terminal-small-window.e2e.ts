import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// In a small window the chat panel slides over the office. The terminals under the office must stop where the panel
// starts, or their right part sits behind it with lines cut off.
test('in a small window the terminal drawer stops at the chat panel, and fills the whole width when it is hidden', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-termsmall-')))
  const dir = join(tmp, 'shop-api')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), SHELL: '/bin/sh' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.setViewportSize({ width: 1000, height: 700 })

    const panel = page.locator('aside:not([hidden])')
    await expect(panel).toBeVisible()
    await page.getByRole('group', { name: 'Terminals' }).getByRole('button', { name: /Terminal/ }).click()
    const drawer = page.getByRole('region', { name: 'Terminals' })
    await expect(drawer.locator('.xterm')).toBeVisible()
    const left = async (sel: ReturnType<typeof page.locator>) => (await sel.boundingBox())!

    // With the panel over the office: the drawer and its terminal end at the panel's left edge.
    const edge = (await left(panel)).x
    await expect.poll(async () => (await left(drawer)).x + (await left(drawer)).width).toBeLessThanOrEqual(edge + 1)
    await expect.poll(async () => (await left(drawer.locator('.xterm'))).x + (await left(drawer.locator('.xterm'))).width).toBeLessThanOrEqual(edge + 1)

    // Hidden, the panel gives the width back, and the terminal fills it.
    await page.getByRole('button', { name: 'Hide panel' }).click()
    await expect(panel).toBeHidden()
    await expect.poll(async () => (await left(drawer)).width).toBeGreaterThan(950)
  } finally {
    await shutdown()
  }
})
