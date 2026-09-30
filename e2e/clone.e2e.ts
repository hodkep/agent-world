import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, headMenu, hire, launchApp } from './launch'

test('clone an agent: its conversation is forked into a new worktree branched from its own', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-clone-'))
  const repo = join(tmp, 'shop')
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
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    await approve(page)
    await expect.poll(async () => (await page.evaluate(() => window.aw.listAgents()))[0]!.started).toBe(true)

    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'ada.txt'), 'wip\n')
    git(ada!.cwd, 'add', '.')
    git(ada!.cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'ada work')

    await headMenu(page, /^Clone$/)
    await expect(page.locator('.agent-head b')).toHaveText('linus', { timeout: 10_000 })
    await expect(page.locator('.term-host:visible')).toContainText(`forked from ${ada!.sessionId}`, { timeout: 10_000 })
    const twin = (await page.evaluate(() => window.aw.listAgents())).find((a) => a.name !== 'ada')!
    expect(twin.branch).not.toBe(ada!.branch)
    expect(git(twin.cwd, 'log', '-1', '--format=%s')).toBe('ada work')
    expect(twin.base).toBe('main')
  } finally {
    await shutdown()
  }
})

test('a clone can continue the conversation on another model', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-clone-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), tmp)
    await page.reload()
    await hire(page, { name: 'ada', model: 'opus' })
    await approve(page)
    await expect.poll(async () => (await page.evaluate(() => window.aw.listAgents()))[0]!.started).toBe(true)
    await headMenu(page, 'Clone as Haiku')
    await expect(page.locator('.agent-head b')).toHaveText('linus', { timeout: 10_000 })
    const twin = (await page.evaluate(() => window.aw.listAgents())).find((a) => a.name === 'linus')!
    expect(twin.options?.model).toBe('haiku')
    await expect(page.locator('.term-host:visible')).toContainText('forked from', { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
