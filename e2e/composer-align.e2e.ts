import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// The box draws its own styled copy of the text behind a see-through textarea. The two must wrap alike, or the caret drifts
// from what is drawn and the lines being typed hide behind it. A scrollbar on the textarea alone (it makes its text narrower) breaks that.
for (const zoom of ['1', '1.2']) {
  test(`what is typed in the message box lines up with the text drawn, however long, at ${Number(zoom) * 100}% zoom`, async () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-align-')))
    const dir = join(tmp, 'proj')
    mkdirSync(dir)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
    const { app, shutdown } = await launchApp({ AW_ZOOM: zoom, AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
    try {
      const page = await app.firstWindow()
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
      await page.reload()
      await hire(page)
      await page.getByRole('tab', { name: 'Chat' }).click()
      const box = page.getByRole('textbox', { name: /^Message/ })
      const look = () =>
        page.evaluate(() => {
          const t = document.querySelector('.composer textarea') as HTMLTextAreaElement
          const m = document.querySelector('.composer-mirror') as HTMLElement
          // The last line drawn, against the box it is drawn in.
          const r = document.createRange()
          r.selectNodeContents(m)
          const rects = r.getClientRects()
          const last = rects[rects.length - 1]!
          const mb = m.getBoundingClientRect()
          return { tw: t.clientWidth, mw: m.clientWidth, th: t.scrollHeight, mh: m.scrollHeight, tTop: Math.round(t.scrollTop), mTop: Math.round(m.scrollTop), lastInside: last.bottom <= mb.bottom + 1 && last.top >= mb.top - 1 }
        })
      await box.fill('okay this is great so far. now we want to do and include in this app is the smart routing using agents with different models and efforts which could be subagents or other agents present in the workspace. asd')
      const a = await look()
      expect(a.tw, 'both wrap at the same width').toBe(a.mw)
      expect(a.th).toBe(a.mh)
      // Many lines, past the height the box grows to: the drawn text follows the textarea's own scrolling, line for line.
      for (let i = 0; i < 12; i++) await box.press('Shift+Enter')
      await box.pressSequentially('the last line typed')
      const b = await look()
      expect(b.tw, 'still the same width once it scrolls').toBe(b.mw)
      expect(b.th).toBe(b.mh)
      expect(b.mTop).toBe(b.tTop)
      expect(b.lastInside, 'the line being typed is in view').toBe(true)
    } finally {
      await shutdown()
    }
  })
}
