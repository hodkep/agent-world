import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a shell command in a reply can be run in the terminal, and words selected in the terminal can be added to the message', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-tc-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'say.md')
  // Claude's shell mode is "! command"; the "! " is not part of what runs. Code in another language has no Run button.
  writeFileSync(doc, 'Run this yourself:\n\n```\n! echo aw-ran-$((20+22))\n```\n\nAnd this is code:\n\n```ts\nconst a = 1\n```\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc, SHELL: '/bin/sh' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const blocks = log.locator('.md pre')
    await expect(blocks).toHaveCount(2, { timeout: 15_000 })
    await expect(blocks.nth(0).getByRole('button', { name: 'Run in terminal' })).toHaveCount(1)
    await expect(blocks.nth(1).getByRole('button', { name: 'Run in terminal' })).toHaveCount(0)

    // Running it opens the terminal and the command runs there, without the "! ".
    const drawer = page.getByRole('region', { name: 'Terminals' })
    await expect(drawer).toBeHidden()
    await blocks.nth(0).hover()
    await blocks.nth(0).getByRole('button', { name: 'Run in terminal' }).click()
    await expect(drawer).toBeVisible()
    const screen = drawer.locator('.term-host:visible')
    await expect(screen).toContainText('aw-ran-42', { timeout: 15_000 })
    await expect(screen).not.toContainText('! echo')

    // Selecting a line of the terminal offers to add it to the agent's message.
    const line = drawer.locator('.xterm-rows > div', { hasText: /^aw-ran-42/ }).first()
    const box = (await line.boundingBox())!
    await page.mouse.click(box.x + 20, box.y + box.height / 2, { clickCount: 3 })
    const add = page.getByRole('button', { name: 'Add selection to message' })
    await expect(add).toBeVisible()
    await add.click()
    // The chat is shown with the words waiting in the message box as a chip.
    await expect(page.getByRole('textbox', { name: 'Message ada' })).toBeVisible()
    await expect(page.getByText('terminal, selection')).toBeVisible()
    await expect(add).toHaveCount(0)

    // The key adds a terminal selection too, and the selection goes as it does with the button.
    await page.mouse.click(box.x + 20, box.y + box.height / 2, { clickCount: 3 })
    await expect(add).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(add).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
