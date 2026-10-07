import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('the Changes column also shows what is uncommitted, with staging, and the commits of the branch', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-views-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  writeFileSync(join(repo, 'old.ts'), 'old\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')

  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    page.on('dialog', (d) => void d.accept())
    await page.setViewportSize({ width: 1500, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    const cwd = agent!.cwd
    git(cwd, 'config', 'user.email', 't@t')
    git(cwd, 'config', 'user.name', 't')
    // One commit of the agent's own, then a staged edit, an unstaged edit and a new file.
    writeFileSync(join(cwd, 'first.ts'), 'export const one = 1\n')
    git(cwd, 'add', '-A')
    git(cwd, 'commit', '-qm', 'feat: first piece')
    writeFileSync(join(cwd, 'README.md'), '# shop\nstaged line\n')
    git(cwd, 'add', 'README.md')
    writeFileSync(join(cwd, 'first.ts'), 'export const one = 11\n')
    rmSync(join(cwd, 'old.ts'))
    writeFileSync(join(cwd, 'fresh.ts'), 'export const f = 1\n')

    await page.getByRole('tab', { name: 'Code' }).click()
    const col = page.locator('.change-list.ch')
    const sw = col.locator('.ch-switch')
    await expect(sw.getByRole('button', { name: /^Branch/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(sw.getByRole('button', { name: 'Uncommitted 4' })).toBeVisible()
    await expect(sw.getByRole('button', { name: 'History 1' })).toBeVisible()

    // Uncommitted: three groups, and a file can be moved between staged and changed.
    await sw.getByRole('button', { name: /^Uncommitted/ }).click()
    const groups = col.locator('.ch-group')
    await expect(groups).toHaveText([/Staged\s*1/, /Changes\s*2/, /New files\s*1/])
    const row = (name: string) => col.locator('li', { hasText: name }).first()
    await row('fresh.ts').hover()
    await row('fresh.ts').getByRole('button', { name: 'Stage fresh.ts' }).click()
    await expect(groups).toHaveText([/Staged\s*2/, /Changes\s*2/])
    await row('fresh.ts').hover()
    await row('fresh.ts').getByRole('button', { name: 'Unstage fresh.ts' }).click()
    await expect(groups).toHaveText([/Staged\s*1/, /Changes\s*2/, /New files\s*1/])

    // A file opens as its uncommitted diff.
    await col.getByRole('button', { name: /first\.ts/ }).first().click()
    await expect(page.locator('.fcrumb')).toContainText('uncommitted')
    await expect(page.locator('.diff')).toContainText('one = 11')

    // Commit just what is staged.
    await col.getByLabel('Commit message').fill('docs: readme line')
    await col.getByRole('button', { name: 'Commit 1 staged' }).click()
    await expect(sw.getByRole('button', { name: 'Uncommitted 3' })).toBeVisible()
    expect(git(cwd, 'log', '-1', '--format=%s')).toBe('docs: readme line')
    expect(git(cwd, 'status', '--porcelain')).toContain('first.ts')

    // History: the two commits, newest first, one is opened to see its files and a file's diff.
    await sw.getByRole('button', { name: /^History/ }).click()
    const commits = col.locator('.commit')
    await expect(commits).toHaveCount(2)
    // Nothing is left on the diff from the file looked at before.
    await expect(page.locator('.fcrumb')).toHaveCount(0)
    await expect(commits.nth(0)).toContainText('docs: readme line')
    await expect(commits.nth(0)).toContainText('HEAD')
    await expect(commits.nth(1)).toContainText('feat: first piece')
    await col.getByLabel('Search commits').fill('first')
    await expect(commits).toHaveCount(1)
    await col.getByLabel('Search commits').fill('')
    await expect(commits).toHaveCount(2)
    await commits.nth(1).click()
    await expect(col.locator('.ch-detail')).toContainText('feat: first piece')
    await col.getByRole('button', { name: /first\.ts/ }).first().click()
    await expect(page.locator('.fcrumb')).toContainText('in commit')
    await expect(page.locator('.diff')).toContainText('one = 1')
    await col.getByRole('button', { name: '← History' }).click()
    await expect(commits).toHaveCount(2)

    // Back to the branch view as it was.
    await sw.getByRole('button', { name: /^Branch/ }).click()
    await expect(col.getByRole('button', { name: 'Commit all' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
