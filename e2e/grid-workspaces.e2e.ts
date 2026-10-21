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

const gridButton = (page: Page) => page.locator('header').getByRole('button', { name: 'Grid', exact: true })
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Grid layout' })
const go = async (page: Page, folder: string) => {
  await page.evaluate((f) => window.aw.activateWorkspace(f), folder)
  await page.reload()
}

test('each workspace is shown as it was left, canvas or grid with its layout, also after a reload', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gridws-')))
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

    // Project two goes to the grid, in conversations; project one was left on the office canvas.
    await gridButton(page).click()
    await bar(page).getByRole('button', { name: 'Conversations' }).click()
    await expect(bar(page).getByRole('button', { name: 'Conversations' })).toHaveAttribute('aria-pressed', 'true')
    await go(page, one)
    await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(bar(page)).toHaveCount(0)

    // Project one to the grid as an overview; two still has its conversations, and each is the same after a reload.
    await gridButton(page).click()
    await expect(bar(page).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true')
    await go(page, two)
    await expect(gridButton(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(bar(page).getByRole('button', { name: 'Conversations' })).toHaveAttribute('aria-pressed', 'true')
    await go(page, one)
    await expect(bar(page).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await run.shutdown()
  }
})

test('after a restart a workspace\'s grid gets a new shell in each cell whose shell ended with the earlier run', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gridws-')))
  const one = repo(tmp, 'project-one')
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await run.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), one)
    await page.reload()
    await hire(page)
    const layout = { root: { kind: 'split', dir: 'row', at: 0.5, a: { kind: 'leaf', tile: 'term:left-over-from-before' }, b: { kind: 'leaf', tile: 'term:another-one' } } }
    await page.evaluate(([f, l]) => localStorage.setItem('aw.gridByFolder', JSON.stringify({ [f!]: { grid: true, layout: JSON.parse(l!) } })), [one, JSON.stringify(layout)])
    await page.reload()
    await expect(page.locator('.pane .xterm')).toHaveCount(2, { timeout: 15_000 })
  } finally {
    await run.shutdown()
  }
})
