import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
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

test('words selected in a tool card (a command and what it printed) can be asked about, like words in a reply', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-quote-tool-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_HOOK_NOTE: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    // The command card is folded to its headline; open it to see the output.
    await log.getByText('git blame').first().click()
    const output = log.getByText('e25bb26c (Ada)')
    await expect(output).toBeVisible()
    await select(page, 'Pratik')
    const ask = page.getByRole('button', { name: 'Ask ada' })
    await expect(ask).toBeVisible()
    await ask.click()
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Quoted from the conversation' }).locator('blockquote')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
