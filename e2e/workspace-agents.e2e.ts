import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const SHOTS = process.env.AW_SHOTS

function repo(parent: string, name: string) {
  const dir = join(parent, name)
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  return dir
}

async function open(page: Page, folder: string) {
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
  await page.reload()
}

async function setup() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wa-')))
  const env = { AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }
  return { tmp, env }
}

test('agents belong to their workspace', async () => {
  const { tmp, env } = await setup()
  const one = repo(tmp, 'project-one')
  const two = repo(tmp, 'project-two')
  const run = await launchApp(env, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, one)
    await expect(page.locator('.ws-button')).toContainText('project-one')
    await hire(page)
    await expect(page.locator('.roster button', { hasText: 'ada' })).toBeVisible()

    await page.evaluate((f) => window.aw.activateWorkspace(f), two)
    await page.reload()
    await expect(page.locator('.ws-button')).toContainText('project-two')
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'two.png') })
    await expect(page.locator('.roster button', { hasText: 'ada' })).toHaveCount(0)

    await page.evaluate((f) => window.aw.activateWorkspace(f), one)
    await page.reload()
    await expect(page.locator('.roster button', { hasText: 'ada' })).toBeVisible()
  } finally {
    await run.shutdown()
  }
})

test('the hoarding behind the office names the workspace', async () => {
  const { tmp, env } = await setup()
  const proj = repo(tmp, 'my-awesome-project')
  const run = await launchApp(env, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, proj)
    await expect(page.locator('.ws-button')).toContainText('my-awesome-project')
    await page.waitForTimeout(500)
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'billboard.png') })
  } finally {
    await run.shutdown()
  }
})

test('typing / lists skills and commands, and @ lists files', async () => {
  const { tmp, env } = await setup()
  const proj = repo(tmp, 'disco')
  const run = await launchApp(env, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, proj)
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.click()
    await box.fill('/')
    const list = page.getByRole('listbox', { name: 'Suggestions' })
    await expect(list).toBeVisible()
    await expect(list.getByRole('option')).not.toHaveCount(0)
    await expect(list).toContainText('/mcp')
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'slash.png') })
    await box.fill('/mc')
    await expect(list.getByRole('option').first()).toContainText('/mcp')
    await box.fill('@')
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'at.png') })
  } finally {
    await run.shutdown()
  }
})

test('the message box holds the controls: icons, model, usage ring and the more menu', async () => {
  const { tmp, env } = await setup()
  const proj = repo(tmp, 'bar')
  const run = await launchApp(env, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, proj)
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.locator('.agent-head, .dock')).toHaveCount(0)
    const box = page.locator('.cbox:visible')
    await expect(box.getByRole('button', { name: 'Attach' })).toBeVisible()
    await expect(box.getByRole('button', { name: /^(Send|Stop)$/ })).toBeVisible()
    await box.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('menu', { name: 'More actions' })
    for (const n of ['Review', 'Clone', 'Handbook', 'Memory', 'Rename', 'Remove agent']) await expect(menu.getByRole('menuitem', { name: new RegExp(n) })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'more.png') })
    await menu.getByRole('menuitem', { name: /Clone/ }).click()
    await expect(menu.getByRole('menuitem', { name: 'Same model' })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'clone.png') })
    await page.keyboard.press('Escape')
  } finally {
    await run.shutdown()
  }
})

test('a command or skill can be completed in the middle of a message', async () => {
  const { tmp, env } = await setup()
  const proj = repo(tmp, 'mid')
  const run = await launchApp(env, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, proj)
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.fill('please run /sec and then tidy up')
    // Put the caret right after "/sec".
    await box.press('Home')
    for (let i = 0; i < 15; i++) await box.press('ArrowRight')
    const list = page.getByRole('listbox', { name: 'Suggestions' })
    await expect(list.getByRole('option').first()).toContainText('/security-review')
    await box.press('Tab')
    await expect(box).toHaveAttribute('data-text', 'please run /security-review and then tidy up')
  } finally {
    await run.shutdown()
  }
})

test('the agent list is folded into a switcher by default', async () => {
  const { tmp, env } = await setup()
  const proj = repo(tmp, 'sw')
  const run = await launchApp({ ...env, AW_DEFAULT_LAYOUT: '1' }, tmp)
  try {
    const page = await run.app.firstWindow()
    await open(page, proj)
    await hire(page)
    await expect(page.locator('nav.roster:visible')).toHaveCount(0)
    await page.getByRole('button', { name: 'Agents', exact: true }).click()
    const menu = page.getByRole('menu', { name: 'Agents' })
    await expect(menu.getByRole('menuitem', { name: /ada/ })).toBeVisible()
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'switcher.png') })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  } finally {
    await run.shutdown()
  }
})
