import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

function repo(parent: string, name: string) {
  const dir = join(parent, name)
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  return dir
}

const drawer = (page: Page) => page.getByRole('region', { name: 'Terminals' })
const toProject = async (page: Page, name: string) => {
  await page.locator('.ws-button').click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
}
const go = async (page: Page, folder: string) => {
  await page.evaluate((f) => window.aw.activateWorkspace(f), folder)
  await page.reload()
}

test('the terminals drawer is each workspace\'s own: opened in one it is not open in another, and each is as it was left, also after a reload', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-termws-')))
  const one = repo(tmp, 'project-one')
  const two = repo(tmp, 'project-two')
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await run.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), one)
    await page.reload()
    await hire(page)
    await go(page, two)
    await hire(page, { name: 'bob' })

    // Project two has its terminals open.
    await page.locator('.term-btn').click()
    await expect(drawer(page)).toBeVisible()
    // Project one never had: it is closed, though two's drawer was open a moment ago.
    await go(page, one)
    await expect(page.locator('.term-btn')).toHaveAttribute('aria-pressed', 'false')
    await expect(drawer(page)).toBeHidden()
    // Open in one too, then hide it in two: each keeps its own.
    await page.locator('.term-btn').click()
    await expect(drawer(page)).toBeVisible()
    await go(page, two)
    await expect(page.locator('.term-btn')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Hide the terminals' }).click()
    await expect(drawer(page)).toBeHidden()
    await go(page, one)
    await expect(drawer(page)).toBeVisible()
    await go(page, two)
    await expect(drawer(page)).toBeHidden()
  } finally {
    await run.shutdown()
  }
})

test('each workspace has its own terminals: switching in the app shows only its own, and going back finds them alive and selected', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-termlist-')))
  const one = repo(tmp, 'project-one')
  const two = repo(tmp, 'project-two')
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await run.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), one)
    await page.reload()
    await hire(page)
    await go(page, two)
    await hire(page, { name: 'bob' })
    await go(page, one)

    const tabs = drawer(page).getByRole('tab')
    const where = drawer(page).locator('.twhere')
    await page.locator('.term-btn').click()
    await expect(tabs).toHaveCount(1)
    await page.getByRole('button', { name: 'New terminal in project-one' }).click()
    await expect(tabs).toHaveCount(2)
    await tabs.nth(0).click()
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')

    // Switch without a reload: the other workspace shows its own (none yet), not these two.
    await toProject(page, 'project-two')
    await expect(page.locator('.ws-button')).toContainText('project-two')
    await expect(page.locator('.term-btn')).toHaveAttribute('aria-pressed', 'false')
    await page.locator('.term-btn').click()
    await expect(where).toHaveText('project-two')
    await expect(tabs).toHaveCount(1)
    await expect(drawer(page).locator('.tbody .tview, .tbody > *')).toHaveCount(1)

    // Back: both of the first one's are there, the first still selected.
    await toProject(page, 'project-one')
    await expect(page.locator('.ws-button')).toContainText('project-one')
    await expect(where).toHaveText('project-one')
    await expect(tabs).toHaveCount(2)
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  } finally {
    await run.shutdown()
  }
})
