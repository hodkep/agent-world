import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('bring back an earlier conversation from the folder as a new agent', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-hist-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init')
  const past = '11111111-2222-3333-4444-555555555555'
  const projects = join(tmp, 'projects')
  const dir = join(projects, repo.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${past}.jsonl`), JSON.stringify({ type: 'user', message: { role: 'user', content: 'Add pagination to the orders list' } }) + '\n')

  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: projects, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.getByRole('button', { name: 'History' }).click()
    await page.getByRole('button', { name: /Add pagination to the orders list/ }).click()
    await page.getByRole('tab', { name: 'Terminal' }).click()
    await expect(page.locator('.term-host:visible')).toContainText(`session ${past}`, { timeout: 10_000 })
    // Now running here, so it can't be started twice.
    await page.getByRole('button', { name: 'History' }).click()
    await expect(page.getByRole('button', { name: /Add pagination/ })).toBeDisabled()
  } finally {
    await shutdown()
  }
})
