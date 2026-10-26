import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('Mod+Alt and a digit go to that tab of the side panel, and a digit past the last tab does nothing', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-tabjump-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    const tabs = page.getByRole('tablist', { name: 'Agent view' }).getByRole('tab')
    const selected = page.getByRole('tablist', { name: 'Agent view' }).locator('[role="tab"][aria-selected="true"]')
    const names = (await tabs.allTextContents()).map((t) => t.trim())
    const at = (n: number) => names[n - 1]!
    for (const n of [3, 1, 2]) {
      await page.keyboard.press(`ControlOrMeta+Alt+Digit${n}`)
      await expect(selected).toHaveText(at(n))
    }
    await page.keyboard.press('ControlOrMeta+Alt+Digit9')
    await expect(selected).toHaveText(at(2))
  } finally {
    await shutdown()
  }
})
