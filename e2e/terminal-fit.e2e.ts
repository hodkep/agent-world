import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('with the terminal open, Fit office fits the office in the part of the stage the drawer leaves free', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-termfit-')))
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
    const stage = page.locator('.stage')
    const view = async () => JSON.parse((await stage.getAttribute('data-view'))!) as { scale: number; x: number; y: number }
    await page.getByRole('button', { name: 'Fit office' }).click()
    const closed = await view()

    await page.getByRole('group', { name: 'Terminals' }).getByRole('button', { name: /Terminal/ }).click()
    const drawer = (await page.getByRole('region', { name: 'Terminals' }).boundingBox())!
    const box = (await stage.boundingBox())!
    // All of the office sits above the drawer's top edge, and below the top of the stage.
    await expect
      .poll(async () => {
        const v = await view()
        return v.scale <= closed.scale + 1e-6 && v.y + 272 * v.scale <= drawer.y - box.y + 1 && v.y >= -1
      })
      .toBe(true)

    // Closing it centres the office in the whole stage again.
    await page.getByRole('group', { name: 'Terminals' }).getByRole('button', { name: /Terminal/ }).click()
    await expect.poll(async () => Math.abs((await view()).y - closed.y)).toBeLessThan(2)
  } finally {
    await shutdown()
  }
})
