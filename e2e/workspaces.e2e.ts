import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the project you worked in is saved, offered first on the next launch, and switchable from the header', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-ws-')))
  const home = join(tmp, 'home')
  const shop = join(tmp, 'shop-api')
  const notes = join(tmp, 'notes')
  mkdirSync(shop)
  mkdirSync(notes)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: shop })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: shop })
  const env = { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }
  try {
    // First launch: open a folder and hire someone in it.
    const first = await launchApp(env, join(tmp, 'unused'))
    let page = await first.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), shop)
    await page.reload()
    await expect(page.locator('.ws-button')).toContainText('shop-api')
    await hire(page)
    // That key only stands in for an old install's folder; a real next launch has no such thing.
    await page.evaluate(() => localStorage.removeItem('aw.folder'))
    await first.shutdown()

    // Second launch: the window asks which project, with the one you worked in listed, and no folder picking.
    const second = await launchApp(env, join(tmp, 'unused'))
    page = await second.app.firstWindow()
    const picker = page.getByRole('dialog', { name: 'Choose a project for this window' })
    await expect(picker.getByRole('button', { name: /^shop-api/ })).toContainText('1 agent')
    await picker.getByRole('button', { name: /^shop-api/ }).click()
    await expect(page.locator('.ws-button')).toContainText('shop-api')
    await expect(page.locator('.ws-button')).toContainText('git')
    // A restart within seconds brings the agent straight back instead of leaving it asleep.
    await expect(page.locator('.roster button', { hasText: 'ada' })).not.toContainText('asleep', { timeout: 10_000 })
    await page.locator('.ws-button').click()
    const menu = page.getByRole('menu', { name: 'Projects' })
    await expect(menu).toContainText('shop-api')
    await expect(menu).toContainText('1 agent')

    // Another folder (no git) opens, and stays out of the saved list until work happens there.
    await page.evaluate((f) => window.aw.activateWorkspace(f), notes)
    await page.reload()
    await expect(page.locator('.ws-button')).toContainText('notes')
    await expect(page.locator('.ws-button')).toContainText('no git')
    await page.locator('.ws-button').click()
    await page.getByRole('menuitem', { name: /shop-api/ }).click()
    await expect(page.locator('.ws-button')).toContainText('shop-api')

    // Forgetting drops it from the list without touching the folder.
    await page.locator('.ws-button').click()
    await page.getByRole('button', { name: 'Forget shop-api' }).click()
    await expect(page.getByRole('menu', { name: 'Projects' })).not.toContainText('shop-api')
    await second.shutdown()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
