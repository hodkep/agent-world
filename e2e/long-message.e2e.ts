import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a long message of yours is kept to a few lines until you ask for all of it', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-long-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const long = join(tmp, 'long.txt')
  writeFileSync(long, Array.from({ length: 40 }, (_, i) => `line number ${i + 1}`).join('\n'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_USER_FILE: long }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const msg = log.locator('.msg.user').first()
    const clamp = msg.locator('.clamp')
    await expect(msg).toContainText('line number 40', { timeout: 15_000 }) // all of it is in the page, so it can be selected
    const small = (await clamp.boundingBox())!.height
    expect(small).toBeLessThan(260)

    await msg.getByRole('button', { name: 'Show more' }).click()
    await expect.poll(async () => (await clamp.boundingBox())!.height).toBeGreaterThan(small * 2)
    await msg.getByRole('button', { name: 'Show less' }).click()
    await expect.poll(async () => (await clamp.boundingBox())!.height).toBe(small)
  } finally {
    await shutdown()
  }
})
