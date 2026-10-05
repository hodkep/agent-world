import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('the list on the left of Files and Changes is resized by dragging the line beside it, and the width is kept', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-side-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')

  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('tab', { name: 'Files', exact: true }).click()

    const list = page.locator('.change-list')
    const grip = page.getByRole('separator', { name: 'Resize the list' })
    const w = async () => Math.round((await list.boundingBox())!.width)
    const start = await w()
    const gb = (await grip.boundingBox())!
    const y = gb.y + gb.height / 2
    const x = gb.x + gb.width / 2

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 80, y, { steps: 5 })
    await page.mouse.up()
    expect(await w()).toBeGreaterThan(start + 60)

    // Far past the limits: never narrower than 140, never leaving the editor less than 240.
    const gb2 = (await grip.boundingBox())!
    await page.mouse.move(gb2.x + 4, y)
    await page.mouse.down()
    await page.mouse.move(0, y, { steps: 5 })
    await page.mouse.up()
    expect(await w()).toBe(140)

    await grip.focus()
    await page.keyboard.press('ArrowRight')
    expect(await w()).toBe(156)

    // Remembered across Changes and a reload.
    await page.getByRole('tab', { name: 'Changes', exact: true }).click()
    expect(await w()).toBe(156)
    await page.reload()
    await page.getByRole('tab', { name: 'Code' }).click()
    expect(await w()).toBe(156)

    await grip.dblclick()
    expect(await w()).toBe(start)
  } finally {
    await shutdown()
  }
})
