import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('agents that started before the workflow was set are named in the Workflows window and the agent\'s Workflow tab, and one press restarts them', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfrestart-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: {} } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    // A program in the middle of a turn cannot be restarted: ada finishes one first.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('hello there')
    await box.press('Enter')
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.assistant').first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)
    await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    // Workflows was on before ada started: nothing to say.
    await expect(win.locator('.lib-notice')).toHaveCount(0)
    // Workflows is switched on again (as after being off): the moment is recorded, and ada started before it.
    await page.waitForTimeout(50)
    await page.evaluate(async () => {
      const p = await window.aw.getPrefs()
      await window.aw.setPrefs({ ...p, workflows: { ...p.workflows, since: Date.now() } })
    })
    const note = win.locator('.lib-notice.warn')
    await expect(note).toContainText('1 agent started before this workflow was set.', { timeout: 15_000 })
    await expect(note).toContainText('ada does not have the workflow tools until it restarts, so no task is recorded.')
    // The agent's own Workflow tab says the same, and its button restarts too.
    await win.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('tab', { name: 'Workflow' }).click()
    const tabNote = page.locator('.wf-tab .lib-notice.warn')
    await expect(tabNote).toContainText('1 agent started before this workflow was set.')
    await tabNote.getByRole('button', { name: 'Restart 1 agent' }).click()
    await expect(page.locator('.wf-tab .lib-notice')).toHaveCount(0, { timeout: 20_000 })
  } finally {
    await shutdown()
  }
})
