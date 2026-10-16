import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('an agent can be hired in a repository with no commits yet: it works in the folder itself, and the form says so', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-unborn-')))
  const project = join(tmp, 'fresh-repo')
  mkdirSync(project)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await expect(form.getByRole('note', { name: 'No commits yet' })).toContainText('has no commits yet, so the agent works in the folder itself')
    await expect(form.getByRole('checkbox', { name: /Work in my folder directly/ })).toBeChecked()
    await expect(form.getByRole('checkbox', { name: /Work in my folder directly/ })).toBeDisabled()
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    // The agent is there, in the folder, with no branch of its own; no raw git error reached the screen, and nothing was left behind.
    await expect(page.getByRole('alert')).toHaveCount(0)
    const agents = await page.evaluate(() => window.aw.listAgents())
    expect(agents).toHaveLength(1)
    expect(agents[0]).toMatchObject({ name: 'ada', cwd: project, branch: null, base: null })
    expect(execFileSync('git', ['branch', '--list', 'aw/*'], { cwd: project, encoding: 'utf8' }).trim()).toBe('')
    expect(existsSync(join(tmp, 'aw', 'worktrees'))).toBe(false)
  } finally {
    await shutdown()
  }
})

test('the folder choice lists a repository with no commits like any other, and a failed hire is a sentence, not a git command', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-unborn2-')))
  const project = join(tmp, 'repo')
  mkdirSync(project)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: project })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    // Asked to branch from something that is not there, the person is told in words.
    const message = await page.evaluate((f) => window.aw.addAgent(f, {}, 'bo', 'no-such-branch').then(() => '', (e: Error) => e.message), project)
    expect(message).toContain('There is no branch called no-such-branch.')
    expect(message).not.toMatch(/Command failed|\/usr\/bin\/git/)
  } finally {
    await shutdown()
  }
})
