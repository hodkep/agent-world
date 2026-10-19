import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire, launchApp } from './launch'
import { shot } from './wf-helpers'

test('Finish checks the work is ready, squashes it onto the base branch and retires the agent', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')

    await chatTab(page)
    const dialog = page.getByRole('region', { name: "Finish ada's work" })
    await expect(dialog).toContainText('1 commit on aw/ada to land', { timeout: 15_000 })
    await expect(dialog).toContainText('No conflicts with main')
    await dialog.getByLabel('Squash into one commit').check()
    await dialog.getByLabel('Commit message').fill('Add a health check')
    await dialog.getByRole('button', { name: 'Land on main' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    expect(git(repo, 'log', '--format=%s', 'main').split('\n')).toEqual(['Add a health check', 'init'])
    expect(git(repo, 'branch', '--list', 'aw/*')).toBe('')
    await expect(page.locator('.roster button')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('Finish says what is in the way instead of landing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')
    writeFileSync(join(ada!.cwd, 'wip.ts'), 'x\n')
    await chatTab(page)
    const dialog = page.getByRole('region', { name: "Finish ada's work" })
    await expect(dialog).toContainText('1 commit on aw/ada to land', { timeout: 15_000 })
    await expect(dialog).toContainText('1 file not committed yet')
    await expect(dialog.getByRole('button', { name: /Land on/ })).toBeDisabled()
  } finally {
    await shutdown()
  }
})

test('a branch that shares no history with its base says so in one red line, counts no commits and cannot be landed', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    // main was rewritten after the branch began: the same work now sits on a history git cannot join to main's.
    git(ada!.cwd, 'checkout', '-q', '--orphan', 'rewritten')
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')
    git(ada!.cwd, 'branch', '-M', 'rewritten', 'aw/ada')
    await chatTab(page)
    const band = page.getByRole('region', { name: "Finish ada's work" })
    await expect(band).toContainText("This branch does not come from main's history: reset it onto main before landing", { timeout: 15_000 })
    await shot(page, 'whatsnew-6-no-shared-history')
    await expect(band).not.toContainText('No conflicts with main')
    await expect(band).not.toContainText('commit on aw/ada to land')
    await expect(band.getByRole('button', { name: /Land on/ })).toBeDisabled()
    // The server refuses too, not only the button.
    await expect(page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }), ada!.id)).rejects.toThrow(/does not come from main's history/)
  } finally {
    await shutdown()
  }
})

