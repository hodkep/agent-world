import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a new agent never reuses a name whose branch an earlier agent left behind', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-names-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
  git('branch', 'aw/ada')
  git('branch', 'aw/linus')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    // ada and linus are taken by old branches, so the first free name is used.
    await expect(page.locator('.hc-name')).toHaveText('grace')

    // Asking for a taken name says why instead of failing inside git.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await expect(page.locator('.error')).toContainText('left over from an earlier agent')
  } finally {
    await shutdown()
  }
})
