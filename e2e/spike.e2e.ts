import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const FAKE = resolve(__dirname, 'fake-claude.mjs')

test('hire an agent, watch it work, approve its permission from the world', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-e2e-'))
  const home = join(tmp, 'home')
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  chmodSync(FAKE, 0o755)

  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: FAKE, FAKE_DELAY_MS: '400' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await expect(page.locator('.stage canvas')).toBeVisible()

    await hire(page)
    await page.locator('.ask-pill').click({ timeout: 15_000 })
    const ask = page.getByRole('dialog')
    await expect(ask).toContainText('Bash')
    await expect(ask).toContainText('pnpm test')
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'permission.png') })

    await ask.getByRole('button', { name: 'Allow' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('decision: allow', { timeout: 10_000 })
    await expect(ask).toHaveCount(0)

    const trees = join(home, 'worktrees')
    expect(existsSync(trees) && readdirSync(trees).some((d) => d.startsWith('shop-api-'))).toBe(true)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'working.png') })
  } finally {
    await shutdown()
  }
})
