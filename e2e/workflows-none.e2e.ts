import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function project(name: string, defaults: Record<string, string> = {}, env: Record<string, string> = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  const prefsFile = join(home, 'preferences.json')
  writeFileSync(prefsFile, JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k === '$repo' ? repo : k, v])) } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', ...env }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { page, repo, prefsFile, shutdown }
}

test('Remove on the built-in Standard says what follows, keeps the choice for this project, and Restore brings it back', async () => {
  const p = await project('wfnone')
  try {
    await p.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = p.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()
    const list = win.getByRole('listbox', { name: 'Workflow list' })
    await list.getByRole('option', { name: /Standard/ }).click()
    await win.getByRole('button', { name: 'Remove', exact: true }).click()
    const ask = win.getByRole('alertdialog', { name: 'Remove Standard' })
    await expect(ask).toContainText('Agents will then work with no workflow: no plan hold, no track, no gate.')
    // Keeping it changes nothing.
    await ask.getByRole('button', { name: 'Keep it' }).click()
    await expect(ask).toHaveCount(0)
    expect(readFileSync(p.prefsFile, 'utf8')).not.toContain('"none"')
    await win.getByRole('button', { name: 'Remove', exact: true }).click()
    await ask.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(list.getByRole('option', { name: /Standard/ })).toContainText('removed for this project')
    await expect(win.getByRole('button', { name: 'Restore Standard' })).toBeVisible()
    await expect.poll(() => JSON.parse(readFileSync(p.prefsFile, 'utf8')).workflows.defaults).toEqual({ [p.repo]: 'none' })
    await win.getByRole('button', { name: 'Restore Standard' }).click()
    await expect(list.getByRole('option', { name: /Standard/ })).not.toContainText('removed')
    await expect.poll(() => JSON.parse(readFileSync(p.prefsFile, 'utf8')).workflows.defaults).toEqual({})
  } finally {
    await p.shutdown()
  }
})

test('in a project that uses no workflow the agent is not reminded to announce tasks, and a project that does use one still is', async () => {
  const none = await project('wfnone2', { $repo: 'none' }, { FAKE_SHOW_REMINDER: '1' })
  try {
    await hire(none.page)
    await expect(none.page.locator('.term-host:visible')).toContainText('REMINDER:', { timeout: 15_000 })
    await expect(none.page.locator('.term-host:visible')).not.toContainText('task_begin')
  } finally {
    await none.shutdown()
  }
  const some = await project('wfnone3', {}, { FAKE_SHOW_REMINDER: '1' })
  try {
    await hire(some.page)
    await expect(some.page.locator('.term-host:visible')).toContainText('task_begin', { timeout: 15_000 })
  } finally {
    await some.shutdown()
  }
})
