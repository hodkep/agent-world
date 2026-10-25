import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs'
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

    // Forgetting drops it from the saved list without touching the folder; a project an agent still works in stays listed, with nothing left to forget.
    await page.locator('.ws-button').click()
    // The × shows when the pointer is over the tile.
    await page.getByRole('menuitem', { name: /shop-api/ }).hover()
    await page.getByRole('button', { name: 'Forget shop-api' }).click()
    await expect(page.getByRole('button', { name: 'Forget shop-api' })).toHaveCount(0)
    await expect(page.getByRole('menu', { name: 'Projects' })).toContainText('1 agent')
    await second.shutdown()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('opening a project brings back the agent that was open in it last', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-last-')))
  const home = join(tmp, 'home')
  const shop = join(tmp, 'shop-api')
  const notes = join(tmp, 'notes')
  mkdirSync(shop)
  mkdirSync(notes)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: shop })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: shop })
  const env = { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }
  const { app, shutdown } = await launchApp(env, join(tmp, 'unused'))
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), shop)
    await page.reload()
    await hire(page, { name: 'ada' })
    await page.evaluate((f) => window.aw.activateWorkspace(f), notes)
    await page.reload()
    await hire(page, { name: 'bea' })
    await expect(page.locator('.hc-name')).toHaveText('bea')

    // Back to the first project: its agent is open, not an empty panel.
    await page.locator('.ws-button').click()
    await page.getByRole('menuitem', { name: /shop-api/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    // And across again.
    await page.locator('.ws-button').click()
    await page.getByRole('menuitem', { name: /notes/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('bea')
  } finally {
    await shutdown()
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('a project whose folder is gone can be removed from the projects menu, with the agents that worked in it and their worktrees', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gone-')))
  const home = join(tmp, 'home')
  const shop = join(tmp, 'shop-api')
  const notes = join(tmp, 'notes')
  mkdirSync(shop)
  mkdirSync(notes)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: shop })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: shop })
  const env = { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }
  try {
    const run = await launchApp(env, tmp)
    const page = await run.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), shop)
    await page.reload()
    await hire(page)
    const worktree = (await page.evaluate(() => window.aw.listAgents()))[0]!.cwd
    expect(existsSync(worktree)).toBe(true)

    // The folder goes away (moved, deleted, a drive that is not there), and the window is on another project.
    renameSync(shop, join(tmp, 'moved'))
    await page.evaluate((f) => window.aw.activateWorkspace(f), notes)
    await page.reload()
    await page.locator('.ws-button').click()
    const menu = page.getByRole('menu', { name: 'Projects' })
    await expect(menu).toContainText('folder is missing')

    // The × asks first, and says what goes.
    await page.locator('.wt-cell', { hasText: 'shop-api' }).hover()
    await page.getByRole('button', { name: 'Remove shop-api' }).click()
    const ask = page.getByRole('dialog', { name: /Remove shop-api/ })
    await expect(ask).toContainText('ada')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    // The menu closes behind the question; nothing was removed.
    await page.locator('.ws-button').click()
    await expect(menu).toContainText('shop-api')
    expect((await page.evaluate(() => window.aw.listAgents())).length).toBe(1)

    await page.locator('.wt-cell', { hasText: 'shop-api' }).hover()
    await page.getByRole('button', { name: 'Remove shop-api' }).click()
    await page.getByRole('dialog', { name: /Remove shop-api/ }).getByRole('button', { name: 'Remove' }).click()
    await expect.poll(async () => (await page.evaluate(() => window.aw.listAgents())).length).toBe(0)
    await page.locator('.ws-button').click()
    await expect(menu).not.toContainText('shop-api')
    expect(existsSync(worktree)).toBe(false)
    await run.shutdown()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
