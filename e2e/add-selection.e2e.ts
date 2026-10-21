import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

/** Select exactly these words in the conversation, as dragging the mouse across them would. */
const select = (page: import('@playwright/test').Page, words: string, within = '[role="log"]') =>
  page.evaluate(([w, root]) => {
    const walker = document.createTreeWalker(document.querySelector(root!)!, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf(w!)
      if (at < 0) continue
      const r = document.createRange()
      r.setStart(n, at)
      r.setEnd(n, at + w!.length)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(r)
      return
    }
    throw new Error(`not on the page: ${w}`)
  }, [words, within])

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

/** How far the Ask box is from the left and the right of the box it is placed in, in pixels (negative: it sticks out), and whether that box scrolls sideways. */
const room = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const b = document.querySelector('.ask-selection') as HTMLElement
    const c = b.offsetParent as HTMLElement
    const r = b.getBoundingClientRect()
    const p = c.getBoundingClientRect()
    return { left: Math.round(r.left - p.left), right: Math.round(p.right - r.right), scrolls: c.scrollWidth > c.clientWidth }
  })

test('the Ask box lies inside the conversation when it opens in a narrow chat or near its right edge, in the side panel and in a grid pane', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-askfit-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, 'The migration runs in three steps: backup, rewrite and verify.\n\nThe rollback keeps the old table for seven days, and then it is dropped.\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(900, 700))
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.getByText('three steps')).toBeVisible({ timeout: 15_000 })

    // Words near the end of a line and in the middle of one, each with the box open: inside the conversation on both sides.
    for (const words of ['verify.', 'rewrite', 'dropped']) {
      await select(page, words)
      await page.getByRole('button', { name: 'Ask ada' }).click()
      await expect(page.getByRole('textbox', { name: 'Ask ada about the selection' })).toBeFocused()
      const r = await room(page)
      expect(r.left, `${words}: left`).toBeGreaterThanOrEqual(0)
      expect(r.right, `${words}: right`).toBeGreaterThanOrEqual(0)
      expect(r.scrolls, `${words}: sideways scroll`).toBe(false)
      await page.keyboard.press('Escape')
    }

    // The same in a grid pane.
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await page.getByRole('toolbar', { name: 'Grid layout' }).getByRole('button', { name: 'Conversations' }).click()
    await page.getByRole('complementary', { name: 'Agents and terminals to add' }).getByRole('button', { name: /^ada/ }).click()
    const pane = page.locator('.pane[aria-label="ada\'s conversation"]')
    await expect(pane.getByText('three steps')).toBeVisible({ timeout: 15_000 })
    for (const words of ['verify.', 'rewrite']) {
      await select(page, words, '.pane[aria-label="ada\'s conversation"] [role="log"]')
      await page.getByRole('button', { name: 'Ask ada' }).click()
      await expect(page.getByRole('textbox', { name: 'Ask ada about the selection' })).toBeFocused()
      const r = await room(page)
      expect(r.left, `grid ${words}: left`).toBeGreaterThanOrEqual(0)
      expect(r.right, `grid ${words}: right`).toBeGreaterThanOrEqual(0)
      expect(r.scrolls, `grid ${words}: sideways scroll`).toBe(false)
      await page.keyboard.press('Escape')
    }
  } finally {
    await shutdown()
  }
})
