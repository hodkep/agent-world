import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('open the project handbook (CLAUDE.md) from the agent header, creating it when missing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-book-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')

  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await page.getByRole('button', { name: 'Approve' }).click({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Handbook' }).click()
    await expect(page.locator('.diff')).toContainText('Project notes')
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    expect(readFileSync(join(agent!.cwd, 'CLAUDE.md'), 'utf8')).toContain('Project notes')
  } finally {
    await shutdown()
  }
})
