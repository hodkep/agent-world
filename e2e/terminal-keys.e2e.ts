import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('in the terminal, Option moves by word and Cmd by line, as in the system terminal', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-termkeys-')))
  const dir = join(tmp, 'shop-api')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), SHELL: '/bin/bash' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('group', { name: 'Terminals' }).getByRole('button', { name: /Terminal/ }).click()
    const term = page.getByRole('region', { name: 'Terminals' })
    await term.locator('.xterm-helper-textarea').first().focus()
    await page.keyboard.type('echo one two')
    await page.keyboard.press('Alt+ArrowLeft')
    await page.keyboard.type('X')
    await page.keyboard.press('Meta+ArrowLeft')
    await page.keyboard.type('Y')
    await expect(term.locator('.xterm-rows')).toContainText('Yecho one Xtwo')
  } finally {
    await shutdown()
  }
})
