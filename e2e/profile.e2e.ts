import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('an agent knows when it was hired, how much it has worked and what it has done', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-prof-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const before = Date.now()
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '300', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    // Hired just now, and the time is kept with the agent, not guessed.
    expect(ada!.hiredAt).toBeGreaterThanOrEqual(before)
    expect(ada!.hiredAt).toBeLessThanOrEqual(Date.now())
    const p0 = await page.evaluate((id) => window.aw.profile(id), ada!.id)
    expect(p0).toMatchObject({ hiredAt: ada!.hiredAt, hiredEstimated: false, turns: 0, files: 0, commits: 0 })

    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('count me')
    await box.press('Enter')
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.assistant').last()).toContainText('count me', { timeout: 10_000 })
    await expect.poll(async () => (await page.evaluate((id) => window.aw.profile(id), ada!.id)).turns, { timeout: 10_000 }).toBe(1)
    const p1 = await page.evaluate((id) => window.aw.profile(id), ada!.id)
    expect(p1.workedMs).toBeGreaterThanOrEqual(0)
    expect(p1.subagents).toBe(0)
  } finally {
    await shutdown()
  }
})
