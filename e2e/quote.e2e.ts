import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
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

test('words selected in an agent reply can be quoted into the message box, as many times as wanted', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-quote-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, 'The migration runs in three steps: backup, rewrite and verify.\n\nThe rollback keeps the old table for seven days.\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const box = page.getByRole('textbox', { name: /^Message/ })
    await expect(log.getByText('three steps')).toBeVisible({ timeout: 15_000 })

    // Nothing is offered until something is selected.
    await expect(page.getByRole('button', { name: 'Ask ada' })).toHaveCount(0)

    // Select a word, then ask: it lands in the box as a quote.
    await select(page, 'rewrite')
    const ask = page.getByRole('button', { name: 'Ask ada' })
    await expect(ask).toBeVisible()
    await ask.click()
    await expect(page.getByRole('list', { name: 'Quoted from the conversation' }).locator('blockquote')).toHaveText(['rewrite'])
    await expect(box).toHaveValue('')
    await expect(ask).toHaveCount(0)

    // A longer selection works too, and a second one adds a second quote, below the first.
    await select(page, 'rollback')
    await page.getByRole('button', { name: 'Ask ada' }).click()
    await expect(page.getByRole('list', { name: 'Quoted from the conversation' }).locator('blockquote')).toHaveText(['rewrite', 'rollback'])
    await expect(box).toHaveValue('')

    // The question goes after them, and the sent message shows both as quotes.
    await page.keyboard.type('why these?')
    await box.press('Enter')
    const sent = log.locator('.msg.user').last()
    await expect(sent.locator('blockquote')).toHaveCount(2, { timeout: 10_000 })
    await expect(sent.locator('blockquote').first()).toHaveText('rewrite')
    await expect(sent).toContainText('why these?')

    // Words in your own message are not offered.
    await sent.getByText('why these?').dblclick()
    await expect(page.getByRole('button', { name: 'Ask ada' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
