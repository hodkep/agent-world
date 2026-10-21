import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

/** Select exactly these words in the conversation, as dragging the mouse across them would. */
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

test('Shift+Mod+L opens the Ask box on the selected words in a reply, as the Ask button does, and does nothing without a selection', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-addsel-')))
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
    await expect(log.getByText('three steps')).toBeVisible({ timeout: 15_000 })
    const quotes = page.getByRole('list', { name: 'Quoted from the conversation' }).locator('blockquote')

    // Nothing selected: the key opens nothing.
    await page.keyboard.press('Control+Shift+L')
    await expect(page.getByRole('textbox', { name: 'Ask ada about the selection' })).toHaveCount(0)
    await expect(quotes).toHaveCount(0)

    // Words selected in a reply: the key opens the box the Ask button opens, with the words still marked, and adds nothing yet.
    await select(page, 'rewrite')
    await expect(page.getByRole('button', { name: 'Ask ada' })).toBeVisible()
    await page.keyboard.press('Control+Shift+L')
    const here = page.getByRole('textbox', { name: 'Ask ada about the selection' })
    await expect(here).toBeFocused()
    await expect(quotes).toHaveCount(0)
    // With the box open the key leaves it alone; typing and Enter adds the quote with the question under it.
    await page.keyboard.press('Control+Shift+L')
    await expect(here).toBeFocused()
    await here.fill('is this right?')
    await here.press('Enter')
    await expect(quotes).toHaveText(['rewrite'])
    await expect(page.getByRole('textbox', { name: 'What to do about this quote' })).toHaveValue('is this right?')
    await expect(here).toHaveCount(0)

    // A second selection: the plain Ctrl+L opens nothing; the key opens the box, and Enter with no question adds the words alone.
    await select(page, 'rollback')
    // The key acts on the selection the chat has seen: wait for its Ask button, as for the first one, or a slow machine presses it too early.
    await expect(page.getByRole('button', { name: 'Ask ada' })).toBeVisible()
    await page.keyboard.press('Control+L')
    await expect(here).toHaveCount(0)
    await page.keyboard.press('Control+Shift+L')
    await expect(here).toBeFocused()
    await here.press('Enter')
    await expect(quotes).toHaveText(['rewrite', 'rollback'])
  } finally {
    await shutdown()
  }
})
