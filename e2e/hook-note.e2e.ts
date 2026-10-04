import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('what a hook told the agent is shown in the chat: who said it, with the full findings behind a button', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-hook-')))
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

    // The agent's reply is there, with a strip on top that says which hook it came after.
    await expect(log).toContainText('The flagged line is the quote cards rule.', { timeout: 15_000 })
    const reply = log.locator('.msg.assistant', { hasText: 'The flagged line is the quote cards rule.' })
    const strip = reply.locator('.hook-strip')
    await expect(strip).toContainText('Ada replied after impeccable@1 · Stop hook · 1 issue')
    // The findings stay folded until asked for, then show the line, the rule and what was found.
    await expect(log.getByText('L962')).toHaveCount(0)
    await strip.getByRole('button', { name: 'Show details' }).click()
    await expect(strip.locator('.hook-ref')).toHaveText('L962')
    await expect(strip.locator('.hook-rule')).toHaveText('side-tab')
    await expect(strip.locator('.hook-text')).toContainText('Side-tab accent border')
    await page.screenshot({ path: join(tmpdir(), 'aw-hook-strip.png') })
    await strip.getByRole('button', { name: 'Hide details' }).click()
    await expect(log.getByText('L962')).toHaveCount(0)

    // A hook note with no reply after it is a note of its own, with its text behind a button.
    const note = log.locator('.msg.note', { hasText: 'lint · PostToolUse:Edit hook' })
    await expect(note).toContainText('2 problems found in a.css')
    await note.getByRole('button', { name: 'Show details' }).click()
    await expect(note.locator('.summary-body')).toContainText('[lint] 2 problems found in a.css')
    // What a session starts with is not news.
    await expect(log).not.toContainText('CAVEMAN')

    // A quote card has a whole thin rim now, not a thick stripe down one side.
    const stripe = await page.evaluate(() => {
      const ul = document.createElement('ul')
      ul.className = 'quote-cards'
      ul.innerHTML = '<li>x</li>'
      document.body.append(ul)
      const w = getComputedStyle(ul.firstElementChild!).borderLeftWidth
      ul.remove()
      return w
    })
    expect(stripe).toBe('0px')
  } finally {
    await shutdown()
  }
})
