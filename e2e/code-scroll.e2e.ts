import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a long command in a reply scrolls sideways under its Copy and Run buttons, which stay in the corner', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-codescroll-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, `Run this:\n\n\`\`\`bash\ncurl -s -o /dev/null -w "%{speed_download}" ${'https://example.com/a/very/long/path/'.repeat(12)} && echo done\n\`\`\`\n`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const pre = page.getByRole('log', { name: 'Conversation with ada' }).locator('pre', { hasText: 'speed_download' })
    await expect(pre).toBeVisible({ timeout: 15_000 })
    const copy = pre.getByRole('button', { name: 'Copy' })
    const run = pre.getByRole('button', { name: 'Run in terminal' })
    await pre.hover()
    const before = [await copy.boundingBox(), await run.boundingBox()]
    // Whatever element scrolls, the line is wider than the block.
    const scrolled = await pre.evaluate((p) => {
      const s = [p, ...p.querySelectorAll('code')].find((e) => e.scrollWidth > e.clientWidth + 50) as HTMLElement
      s.scrollLeft = 400
      return s.scrollLeft
    })
    expect(scrolled).toBeGreaterThan(0)
    const after = [await copy.boundingBox(), await run.boundingBox()]
    expect(after.map((b) => b!.x)).toEqual(before.map((b) => b!.x))
  } finally {
    await shutdown()
  }
})
