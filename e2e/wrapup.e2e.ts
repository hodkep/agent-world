import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()

async function start(extra: Record<string, string> = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wrap-')))
  const dir = join(home, 'proj')
  mkdirSync(join(dir, '.okf'), { recursive: true })
  writeFileSync(join(dir, '.okf', 'spec.md'), '# spec\n')
  writeFileSync(join(dir, 'app.ts'), 'export {}\n')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.')
  git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  const run = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', ...extra }, home)
  const page = await run.app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  const [agent] = await page.evaluate(() => window.aw.listAgents())
  return { ...run, page, agent: agent!, dir }
}

test('closing the app commits an agent\'s unfinished work on its own branch', async () => {
  const { app, page, agent, shutdown } = await start({ FAKE_CHILD: '1' })
  try {
    writeFileSync(join(agent.cwd, 'wip.txt'), 'half done\n')
    expect(git(agent.cwd, 'status', '--porcelain')).toContain('wip.txt')
    await app.close()
    expect(git(agent.cwd, 'log', '-1', '--format=%s')).toBe('chore(ada): work in progress')
    expect(git(agent.cwd, 'status', '--porcelain')).toBe('')
    expect(git(agent.cwd, 'show', '--stat', '--format=', 'HEAD')).toContain('wip.txt')
  } finally {
    await shutdown()
  }
})

test('with the Settings choice off, closing leaves the work as it was', async () => {
  const { app, page, agent, shutdown } = await start()
  try {
    await page.evaluate(async () => window.aw.setPrefs({ ...(await window.aw.getPrefs()), wrapUp: false }))
    writeFileSync(join(agent.cwd, 'wip.txt'), 'half done\n')
    await app.close()
    expect(git(agent.cwd, 'status', '--porcelain')).toContain('wip.txt')
    expect(git(agent.cwd, 'log', '-1', '--format=%s')).toBe('init')
  } finally {
    await shutdown()
  }
})

test('the Settings dialog has the wrap-up choice, on by default', async () => {
  const { page, shutdown } = await start()
  try {
    await page.getByRole('button', { name: 'Settings' }).click()
    const box = page.getByRole('checkbox', { name: /When I quit, stop the agents' running commands/ })
    await expect(box).toBeChecked()
    await box.uncheck()
    await expect.poll(() => page.evaluate(async () => (await window.aw.getPrefs()).wrapUp)).toBe(false)
  } finally {
    await shutdown()
  }
})

test('the .okf spec folder is told to agents and hidden from the app', async () => {
  const { page, agent, shutdown } = await start()
  try {
    // The agent is launched with a pointer to the spec (the fake prints its arguments).
    await expect(page.locator('.term-host:visible')).toContainText('.okf/spec.md', { timeout: 10_000 })
    // The app's own file list and changes never show it, though it is in the worktree.
    const files = await page.evaluate((id) => window.aw.code.files(id), agent.id)
    expect(files).toContain('app.ts')
    expect(files.some((f: string) => f.startsWith('.okf'))).toBe(false)
  } finally {
    await shutdown()
  }
})
