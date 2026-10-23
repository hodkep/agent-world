import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a quoted block in a reply has a copy button that copies its words, and a code block keeps its own', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-quotecopy-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, 'Try this:\n\n> Get agy to read prefs.ts and tell me what it validates.\n>\n> Wait for its answer.\n\nAnd this:\n\n```\nnpm test\n```\n\nAnd the query:\n\n```sql\n-- counts\nselect relname, n_live_tup\n  from pg_stat_user_tables;\n```\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ clipboard }) => {
      ;(globalThis as unknown as { copied: string[] }).copied = []
      const w = clipboard.writeText.bind(clipboard)
      clipboard.writeText = (t: string) => ((globalThis as unknown as { copied: string[] }).copied.push(t), w(t))
    })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const quote = log.locator('blockquote').first()
    await expect(quote).toBeVisible({ timeout: 15_000 })
    // Shown without hovering, so it can be found.
    const copy = quote.getByRole('button', { name: 'Copy' })
    await expect(copy).toBeVisible()
    await copy.click()
    await expect(copy).toHaveAttribute('data-copied', 'true')
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Get agy to read prefs.ts and tell me what it validates.\n\nWait for its answer.')
    // The words of the quote are not changed by the button being in it.
    await expect(quote).toContainText('Wait for its answer.')
    await expect(log.locator('pre').getByRole('button', { name: 'Copy' })).toHaveCount(2)
    // A coloured code block copies the text it was written with: its lines, and plain spaces a shell or psql will read.
    const sql = log.locator('pre', { hasText: 'pg_stat_user_tables' })
    await expect(sql.locator('code span[class*="mtk"]').first()).toBeVisible({ timeout: 15_000 })
    await sql.getByRole('button', { name: 'Copy' }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('-- counts\nselect relname, n_live_tup\n  from pg_stat_user_tables;\n')
  } finally {
    await shutdown()
  }
})
