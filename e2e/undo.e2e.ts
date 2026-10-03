import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('undo and redo in the message box step back through typing bursts, and a completion, without losing earlier steps', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-undo-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  writeFileSync(join(dir, 'README.md'), '# x\n')
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.click()
    await page.keyboard.type('first part ', { delay: 20 })
    await page.waitForTimeout(1300)
    await page.keyboard.type('second part ', { delay: 20 })
    await page.waitForTimeout(1300)
    await page.keyboard.type('@READ', { delay: 20 })
    await page.keyboard.press('Tab')
    await expect(box).toHaveValue('first part second part @README.md ')
    await page.waitForTimeout(100) // the completion puts the caret after itself on the next frame
    await page.keyboard.type('end', { delay: 20 })
    await expect(box).toHaveValue('first part second part @README.md end')

    // Every step back is one burst of typing or one completion, however many there are.
    const back = ['first part second part @README.md ', 'first part second part @READ', 'first part second part ', 'first part ', '']
    for (const v of back) {
      await page.keyboard.press('ControlOrMeta+z')
      await expect(box).toHaveValue(v)
    }
    // Nothing is lost on the way back: forward again reaches the end.
    for (const v of [...back.slice(0, -1).reverse(), 'first part second part @README.md end']) {
      await page.keyboard.press('ControlOrMeta+Shift+z')
      await expect(box).toHaveValue(v)
    }
  } finally {
    await shutdown()
  }
})
