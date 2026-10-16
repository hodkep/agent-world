import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

/**
 * Starts the PACKED app (pnpm run pack, or a dmg that was installed) the way Finder starts it: a bare PATH and a home folder of its own, with its bundled
 * git chosen on purpose, and hires an agent in a git project. It proves the git that comes with the app runs and is what creates the agent's worktree.
 *   PACKED_APP="/path/to/Agent World.app/Contents/MacOS/Agent World" pnpm exec playwright test e2e/packed.e2e.ts
 */
test('the packed app runs its own bundled git, from a bare path and a home of its own, and hires an agent with it', async () => {
  test.skip(!process.env.PACKED_APP, 'set PACKED_APP to the executable of a packed app')
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-packed-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const project = join(tmp, 'project')
  mkdirSync(project)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=dev', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: project })
  const app = await electron.launch({
    executablePath: process.env.PACKED_APP!,
    args: [],
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, USER: 'fresh', SHELL: '/bin/zsh', AW_HOME: join(tmp, 'aw'), AW_NO_SETUP: '1', AW_GIT: 'bundled', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', AW_ZOOM: '1', AW_AGY_BIN: '/no/such/agy' }
  })
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    const info = await page.evaluate(() => window.aw.gitInfo())
    expect(info?.source).toBe('bundled')
    expect(info?.bin).toMatch(/Resources\/git\/bin\/git$/)
    expect(existsSync(info!.bin)).toBe(true)
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    // The worktree was made by the bundled git: it is there, on its own branch.
    await expect.poll(() => existsSync(join(tmp, 'aw', 'worktrees')), { timeout: 20_000 }).toBe(true)
    const branches = execFileSync('git', ['branch', '--list', 'aw/ada'], { cwd: project, encoding: 'utf8' })
    expect(branches).toContain('aw/ada')
  } finally {
    await app.close()
  }
})
