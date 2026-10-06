import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a first-run dialog with only Enter and Esc shows in the chat, so a message is never sent into the dark', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-dialog-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_DIALOG: '1' },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(card).toContainText('control your browser', { timeout: 20_000 })
    await card.getByRole('button', { name: 'Confirm (Enter)' }).click()
    await expect(card).toBeHidden({ timeout: 10_000 })
  } finally {
    await shutdown()
  }
})
