import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

/** Select exactly these words in the page, as dragging the mouse across them would. */
const select = (page: import('@playwright/test').Page, words: string) =>
  page.evaluate((w) => {
    const walker = document.createTreeWalker(document.querySelector('[role="log"]')!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(w)
      if (at < 0) continue
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + w.length)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      return
    }
    throw new Error(`not on the page: ${w}`)
  }, words)

test('words quoted while the agent is asleep after a restart are in the message box once it wakes', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-qasleep-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, 'The migration runs in three steps: backup, rewrite and verify.\n')
  const env = { AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }
  try {
    // First run: an agent in the project says something. Then the app quits, which puts every agent to sleep.
    const first = await launchApp(env, join(tmp, 'unused'))
    let page = await first.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).getByText('three steps')).toBeVisible({ timeout: 15_000 })
    await first.shutdown()
    // A restart within seconds brings agents straight back; a real one comes later, so forget that they were running.
    rmSync(join(tmp, 'home', 'running.json'), { force: true })

    // Second run: the conversation is there, the agent is asleep; its words can still be quoted.
    const second = await launchApp(env, join(tmp, 'unused'))
    page = await second.app.firstWindow()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('three steps')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('ada is asleep.')).toBeVisible()
    await select(page, 'rewrite')
    await page.getByRole('button', { name: 'Ask ada' }).click()
    // Asleep there is no box to show it in, but it is not lost: the composer says so, and shows it once the agent wakes.
    await expect(page.locator('.composer.asleep')).toContainText('1 quote waiting')
    await page.getByRole('button', { name: 'Wake ada' }).click()
    await expect(page.getByRole('list', { name: 'Quoted from the conversation' }).locator('blockquote')).toHaveText(['rewrite'], { timeout: 15_000 })
    await second.shutdown()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
