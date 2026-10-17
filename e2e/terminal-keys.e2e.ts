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

test('in the terminal, Cmd+F finds text, Cmd+Up jumps to the previous command, Cmd+K clears', async () => {
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
    await page.keyboard.type('echo FIRSTMARK')
    await page.keyboard.press('Enter')
    await page.keyboard.type('seq 1 120')
    await page.keyboard.press('Enter')
    await expect(term.locator('.xterm-rows')).toContainText('120')
    // The shell has given its prompt back after the long output, so the prompts that Cmd+Up goes between are all marked: the last line is a prompt, not output still arriving.
    await expect
      .poll(() => term.locator('.xterm-rows > div').evaluateAll((rows) => rows.map((r) => r.textContent ?? '').filter((t) => t.trim() !== '').at(-1) ?? ''), { timeout: 20_000 })
      .toMatch(/[$#%][\s\u00a0]*$/)

    // The prompt before the long output is what Cmd+Up scrolls to.
    await page.keyboard.press('Meta+ArrowUp')
    await expect(term.locator('.xterm-rows')).toContainText('seq 1 120')
    await expect(page.getByRole('button', { name: 'Scroll to the latest output' })).toBeVisible()
    await page.getByRole('button', { name: 'Scroll to the latest output' }).click()
    await expect(term.locator('.xterm-rows')).toContainText('120')

    await page.keyboard.press('Meta+f')
    const find = page.getByRole('textbox', { name: 'Find in terminal' })
    await find.fill('FIRSTMARK')
    await expect(page.locator('.term-find-n')).toHaveText('2 of 2')
    await page.keyboard.press('Escape')
    await expect(find).toHaveCount(0)

    await term.locator('.xterm-helper-textarea').first().focus()
    await page.keyboard.press('Meta+k')
    await expect(term.locator('.xterm-rows')).not.toContainText('FIRSTMARK')
  } finally {
    await shutdown()
  }
})
