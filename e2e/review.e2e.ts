import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, headMenu, hire, launchApp } from './launch'

test('hand a branch to another agent for review, or hire a fresh reviewer', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-rev-'))
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
    await hire(page, { name: 'ada' })
    await approve(page)
    await hire(page, { name: 'linus' })
    await approve(page)
    await page.locator('.roster button', { hasText: 'ada' }).click()

    await headMenu(page, 'Ask linus to review')
    await page.getByRole('tab', { name: /^Traces/ }).click()
    const log = page.locator('.traces .message').first()
    await expect(log).toContainText('ada')
    await expect(log).toContainText('linus')
    await expect(log).toContainText('review their work on branch aw/ada')
    await page.locator('.roster button', { hasText: 'linus' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('ada asks you to review their work on branch aw/ada', { timeout: 10_000 })

    // A new reviewer walks in, read-only.
    await page.locator('.roster button', { hasText: 'ada' }).click()
    await headMenu(page, 'Hire a new reviewer')
    await expect(page.locator('.roster button')).toHaveCount(3)
    const agents = await page.evaluate(() => window.aw.listAgents())
    expect(agents[2]!.options?.permissionMode).toBe('plan')
  } finally {
    await shutdown()
  }
})
