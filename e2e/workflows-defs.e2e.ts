import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const BUG_FIX = {
  version: 1,
  id: 'bug-fix',
  name: 'Bug fix',
  when: 'A defect with a known symptom.',
  steps: [
    { id: 'plan', kind: 'plan', brief: 'Name the symptom and the likely cause.' },
    { id: 'fix', kind: 'work', name: 'Fix, test first', skills: ['tdd'], brief: 'Write a failing test, then make it pass.' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 3 },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge', gate: 'approve' }
  ]
}
const QUICK = { version: 1, id: 'quick-change', name: 'Quick change', when: 'Typos, copy, config.', steps: [{ id: 'build', kind: 'work' }, { id: 'land', kind: 'merge' }] }

test('the Workflows tab lists the built-in, global and project workflows, shows a workflow\'s steps, names the problems of a broken file, and copies, deletes and chooses the default', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfdefs-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  const projectDir = join(repo, '.agent-world', 'workflows')
  mkdirSync(join(home, 'workflows'), { recursive: true })
  mkdirSync(projectDir, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true } }))
  writeFileSync(join(home, 'workflows', 'quick-change.json'), JSON.stringify(QUICK))
  writeFileSync(join(projectDir, 'bug-fix.json'), JSON.stringify(BUG_FIX))
  writeFileSync(join(projectDir, 'broken.json'), '{ "id": ')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    await expect(win).toContainText('No runs yet')
    await win.getByRole('tab', { name: 'Workflows' }).click()
    const list = win.getByRole('listbox', { name: 'Workflow list' })
    await expect(list.getByRole('option')).toHaveText([/Standard/, /Bug fix/, /Quick change/, /broken\.json/])
    await expect(list.getByRole('option', { name: /Standard/ })).toContainText('default')

    // A workflow's steps: names, who stops it, the skill, the command and the brief.
    await list.getByRole('option', { name: /Bug fix/ }).click()
    const steps = win.getByRole('list', { name: 'Steps' })
    await expect(steps.getByRole('listitem')).toHaveCount(5)
    await expect(steps).toContainText('Fix, test first')
    await expect(steps).toContainText('skill: tdd')
    await expect(steps).toContainText('runs: npm test (sent back up to 3 times)')
    await expect(steps).toContainText('must pass')
    await expect(steps.getByRole('listitem').first()).toContainText('you approve')
    await expect(win).toContainText('Write a failing test, then make it pass.')
    await expect(win).toContainText(join(projectDir, 'bug-fix.json'))

    // A file that does not read says why.
    await list.getByRole('option', { name: /broken\.json/ }).click()
    await expect(win.getByRole('list', { name: 'Problems' })).toContainText('Not valid JSON')

    // The built-in cannot be deleted, but can be chosen as the default again, and copied.
    await list.getByRole('option', { name: /Standard/ }).click()
    await expect(win.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    // Make a workflow this project's default: it is remembered in the preferences, by project.
    await list.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Make default for shop' }).click()
    await expect(win).toContainText('Default for shop')
    await expect(list.getByRole('option', { name: /Bug fix/ })).toContainText('default')
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8')).workflows.defaults).toEqual({ [repo]: 'bug-fix' })

    // Copy a global workflow into the project, then delete the copy after being asked.
    await list.getByRole('option', { name: /Quick change/ }).click()
    await win.getByRole('button', { name: 'Copy to shop' }).click()
    const copy = list.getByRole('option', { name: /Quick change \(copy\)/ })
    await expect(copy).toBeVisible()
    expect(existsSync(join(projectDir, 'quick-change-copy.json'))).toBe(true)
    await copy.click()
    await win.getByRole('button', { name: 'Delete' }).click()
    await expect(win.getByRole('alertdialog', { name: /Delete/ })).toContainText('This cannot be undone')
    await win.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
    expect(existsSync(join(projectDir, 'quick-change-copy.json'))).toBe(true)
    await win.getByRole('button', { name: 'Delete' }).click()
    await win.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(copy).toHaveCount(0)
    expect(existsSync(join(projectDir, 'quick-change-copy.json'))).toBe(false)

    // Back on Runs nothing has changed.
    await win.getByRole('tab', { name: 'Runs' }).click()
    await expect(win).toContainText('No runs yet')
  } finally {
    await shutdown()
  }
})
