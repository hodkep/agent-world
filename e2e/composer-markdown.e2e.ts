import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a little markdown in the message box shows formatted above it, and in the sent message', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-md-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const preview = page.getByLabel('Preview of your message')

    await box.fill('plain words')
    await expect(preview).toHaveCount(0)

    await box.fill('> again\n\nmake it **bold** please')
    await expect(preview.locator('blockquote')).toHaveText('again')
    await expect(preview.locator('strong')).toHaveText('bold')

    await box.press('Enter')
    const sent = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(sent.locator('strong')).toHaveText('bold', { timeout: 10_000 })
    await expect(sent.locator('blockquote')).toContainText('again')
    await expect(preview).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
