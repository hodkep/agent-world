import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('review an agent\'s change, commit it, merge it, and edit a file in the app', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-code-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')

  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    page.on('dialog', (d) => void d.accept())
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    git(agent!.cwd, 'config', 'user.email', 't@t')
    git(agent!.cwd, 'config', 'user.name', 't')

    // The agent "writes" a new file.
    writeFileSync(join(agent!.cwd, 'health.ts'), 'export const ok = true\n')
    await page.getByRole('tab', { name: 'Code' }).click()
    const list = page.locator('.change-list ul')
    await expect(list).toContainText('health.ts')
    await list.getByRole('button', { name: /health\.ts/ }).click()
    await expect(page.locator('.diff')).toContainText('export const ok = true')

    await page.getByLabel('Commit message').fill('add health check')
    await page.getByRole('button', { name: 'Commit all' }).click()
    await expect(page.locator('.notice')).toContainText('Committed')
    expect(git(agent!.cwd, 'log', '-1', '--format=%s')).toBe('add health check')

    await page.getByRole('button', { name: 'Merge into main' }).click()
    await expect(page.locator('.notice')).toContainText('Merged into: main')
    expect(readFileSync(join(repo, 'health.ts'), 'utf8')).toBe('export const ok = true\n')

    await page.getByRole('tab', { name: 'Files' }).click()
    await page.locator('.change-list').getByRole('button', { name: /README\.md/ }).click()
    await expect(page.locator('.diff')).toContainText('# shop')
    await page.locator('.diff .view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('edited in agent world')
    await expect(page.locator('.diff')).toContainText('edited in agent world')
    await expect(page.getByRole('button', { name: /Save/ })).toContainText('•')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => readFileSync(join(agent!.cwd, 'README.md'), 'utf8')).toContain('edited in agent world')
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'code.png') })
  } finally {
    await shutdown()
  }
})
