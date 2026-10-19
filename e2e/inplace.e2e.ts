import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'
import { shot } from './wf-helpers'

test('an agent can work in the folder itself, and removing a worktree agent deletes its finished branch', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-inplace-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
  // An old branch with the agent's name is no reason to refuse it a name when it makes no branch.
  git('branch', 'aw/quick')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('quick')
    await form.getByLabel('Work in my folder directly (no branch)').check()
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    const [quick] = await page.evaluate(() => window.aw.listAgents())
    expect(quick!.branch).toBeNull()
    expect(realpathSync(quick!.cwd)).toBe(realpathSync(repo))
    expect(git('branch', '--list', 'aw/*').trim()).toBe('aw/quick')

    // Its Code tab lists what is uncommitted in the folder, can commit it, and then lists the commit.
    writeFileSync(join(repo, 'notes.md'), 'work\n')
    await page.getByRole('tab', { name: 'Code' }).click()
    await expect(page.getByText('in your folder')).toBeVisible()
    await expect(page.getByRole('note').filter({ hasText: 'works straight in this folder' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Branch/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Merge into/ })).toHaveCount(0)
    const file = page.getByRole('button', { name: 'notes.md' })
    await expect(file).toBeVisible()
    await page.getByLabel('Commit message').fill('docs: notes')
    await page.getByRole('button', { name: 'Commit all' }).click()
    await page.getByRole('button', { name: /^Commits/ }).click()
    await expect(page.getByRole('list', { name: 'Commits' })).toContainText('docs: notes')
    expect(git('log', '-1', '--format=%s').trim()).toBe('docs: notes')

    // A normal agent gets a branch; removing it with nothing to lose takes the branch too.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const again = page.getByRole('form', { name: 'Hire an agent' })
    await again.getByLabel('Name').fill('tidy')
    await again.getByRole('button', { name: 'Hire' }).click()
    await again.waitFor({ state: 'detached' })
    expect(git('branch', '--list', 'aw/*')).toContain('aw/tidy')
    const tidy = (await page.evaluate(() => window.aw.listAgents())).find((a) => a.name === 'tidy')!
    expect((await page.evaluate((id) => window.aw.removeAgent(id), tidy.id)).ok).toBe(true)
    expect(git('branch', '--list', 'aw/*').trim()).toBe('aw/quick')
  } finally {
    await shutdown()
  }
})

test("an agent in the folder itself sees every commit of the folder, a page at a time, with a line where it started", async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-inplace-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  for (let i = 1; i <= 54; i++) git('commit', '-q', '--allow-empty', '-m', `old ${i}`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('quick')
    await form.getByLabel('Work in my folder directly (no branch)').check()
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    writeFileSync(join(repo, 'new.txt'), 'n')
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'], { cwd: repo })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'made by quick'], { cwd: repo })
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('button', { name: /^Commits/ }).click()
    const list = page.getByRole('list', { name: 'Commits' })
    await expect(list.getByRole('separator').nth(0)).toHaveText('Since quick started · 1')
    await expect(list.getByRole('separator').nth(1)).toHaveText('Before quick started · 55')
    // One page of 50 commits, not all 56; the rest on request.
    await expect(list.locator('li .commit')).toHaveCount(50)
    await shot(page, 'whatsnew-5-older-commits')
    await list.getByRole('button', { name: /Show older commits/ }).click()
    await expect(list.locator('li .commit')).toHaveCount(56)
  } finally {
    await shutdown()
  }
})

