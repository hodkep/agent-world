import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a git graph in a reply is drawn in colours that show on the dark chat: no black branch lines or commit dots', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-mermaid-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: resolve(__dirname, 'fixtures/mermaid-git.md') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const svg = page.getByRole('log', { name: 'Conversation with ada' }).locator('.mermaid svg').first()
    await expect(svg).toBeVisible({ timeout: 20_000 })
    // (The hole in a merge dot is dark on purpose, inside a bright ring.) The brightest paint (stroke or fill) of every line, path and dot the graph draws: the dark panel is about 12 out of 255.
    const dimmest = await svg.evaluate((el) => {
      const light = (c: string) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c)
        return m ? 0.2126 * +m[1]! + 0.7152 * +m[2]! + 0.0722 * +m[3]! : 0
      }
      const paints = [...el.querySelectorAll('line, path, circle:not(.commit-merge)')].map((n) => {
        const s = getComputedStyle(n)
        return { cls: n.getAttribute('class') ?? n.tagName, seen: Math.max(s.stroke === 'none' ? 0 : light(s.stroke), s.fill === 'none' ? 0 : light(s.fill)) }
      })
      return { count: paints.length, worst: paints.sort((a, b) => a.seen - b.seen)[0] }
    })
    expect(dimmest.count).toBeGreaterThan(5)
    expect(dimmest.worst!.seen, `darkest drawn thing: ${dimmest.worst!.cls}`).toBeGreaterThan(100)
  } finally {
    await shutdown()
  }
})
