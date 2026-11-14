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
  writeFileSync(prefsFile, JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, defaults: Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k === '$repo' ? repo : k, v])) } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', ...env }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { page, repo, prefsFile, shutdown }
}

test('the built-in Standard is renamed by hand and deleted like any workflow: it leaves the list for good and agents then work with no workflow', async () => {
  const p = await project('wfnone')
  try {
    await p.page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = p.page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()
    const list = win.getByRole('listbox', { name: 'Workflow list' })
    await list.getByRole('option', { name: /Standard/ }).click()
    // Rename: Escape leaves the name, Save keeps the new one; the id and the steps stay.
    await win.getByRole('button', { name: 'Rename Standard' }).click()
    await win.getByRole('textbox', { name: 'Workflow name' }).press('Escape')
    await expect(win.getByRole('textbox', { name: 'Workflow name' })).toHaveCount(0)
    await win.getByRole('button', { name: 'Rename Standard' }).click()
    await win.getByRole('textbox', { name: 'Workflow name' }).fill('Our flow')
    await win.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(list.getByRole('option', { name: /Our flow/ })).toContainText('Everything')
    expect(JSON.parse(readFileSync(join(p.repo, '..', 'home', 'workflows', 'standard.json'), 'utf8'))).toMatchObject({ id: 'standard', name: 'Our flow' })
    // Delete: it says it will not come back; Cancel changes nothing.
    await win.getByRole('button', { name: 'More' }).click()
    await win.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    const ask = win.getByRole('alertdialog', { name: 'Delete Our flow' })
    await expect(ask).toContainText('Delete standard.json?')
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect(list.getByRole('option')).toHaveCount(1)
    // A fresh Standard, never renamed, is built in: deleting it says so and takes it away for good.
    await win.getByRole('button', { name: 'More' }).click()
    await win.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    await ask.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(list.getByRole('option')).toHaveCount(0)
    await expect(win).toContainText('There are no workflows')
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
