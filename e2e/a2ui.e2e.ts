import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a reply can hold a diagram and a form the agent drew: the diagram is a picture, the form answers the agent when its button is pressed, and a block that is not a form stays as written', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-a2ui-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: resolve(__dirname, 'fixtures/a2ui-reply.md') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    await expect(log.locator('.mermaid svg')).toBeVisible({ timeout: 20_000 })
    const form = log.locator('.a2ui')
    await expect(form).toHaveCount(1)
    await expect(form.getByRole('heading', { name: 'Which pipeline first?' })).toBeVisible()
    // Not a surface: shown as the code it is.
    await expect(log.locator('pre code.language-a2ui')).toContainText('this')

    // The data the agent gave is what the form starts with, and it is changed by hand.
    await expect(form.getByLabel('hourly')).toBeChecked()
    await form.getByLabel('daily').check()
    await form.getByLabel('Dry run only').check()
    await form.getByLabel(/Batch size/).fill('2500')

    await form.getByRole('button', { name: 'Start' }).click()
    // What the agent is told is the A2UI action, with the values read from the form as it was left.
    const said = log.getByText(/A2UI action "start_fix"/)
    await expect(said).toBeVisible()
    await expect(said).toContainText('"pipeline":["daily"]')
    await expect(said).toContainText('"batch":2500')
    await expect(said).toContainText('"dry":true')
    // Pressed once: it cannot be sent again from the same form.
    await expect(form.getByRole('button', { name: 'Start' })).toBeDisabled()
  } finally {
    await shutdown()
  }
})
