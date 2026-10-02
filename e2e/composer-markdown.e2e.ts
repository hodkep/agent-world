import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a little markdown is styled in place as you type, with no separate preview, and formatted in the sent message', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-md-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    const preview = page.getByLabel('Preview of your message')

    await box.fill('plain words')
    await expect(preview).toHaveCount(0)

    // Commands, plugin skills and files are tinted wherever they are in the message, not only at the start.
    await box.fill('please run /compact then /impeccable:polish on @src/app.ts')
    const mirror = page.locator('.composer-mirror')
    await expect(mirror.locator('mark.tok-command')).toHaveText('/compact')
    await expect(mirror.locator('mark.tok-plugin')).toHaveText('/impeccable:polish')
    await expect(mirror.locator('mark.tok-file')).toHaveText('@src/app.ts')

    // Styled where it is typed: the text stays as typed (so the caret lines up), and nothing is drawn above the box.
    await box.fill('1. I mean sub-agent only\n2. ')
    await expect(mirror.locator('.md-list')).toHaveText(['1. ', '2. '])
    await expect(preview).toHaveCount(0)
    await expect(box).toHaveValue('1. I mean sub-agent only\n2. ')
    await expect.poll(() => mirror.evaluate((m) => m.textContent)).toBe('1. I mean sub-agent only\n2. \n')
    await page.screenshot({ path: join(tmpdir(), 'aw-composer-list.png') })

    await box.fill('> again\n\nmake it **bold** and *soft* and `code` please')
    await expect(mirror.locator('.md-quote')).toHaveText('> ')
    await expect(mirror.locator('.md-bold')).toHaveText('bold')
    await expect(mirror.locator('.md-italic')).toHaveText('soft')
    await expect(mirror.locator('.md-code')).toHaveText('code')
    await expect(preview).toHaveCount(0)
    await page.screenshot({ path: join(tmpdir(), 'aw-composer-inline.png') })

    await box.press('Enter')
    const sent = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(sent.locator('strong')).toHaveText('bold', { timeout: 10_000 })
    await expect(sent.locator('blockquote')).toContainText('again')
    await expect(sent.locator('code')).toHaveText('code')
    await expect(preview).toHaveCount(0)

    // Lines you wrote stay lines in the sent message, with the markdown drawn on top of them.
    await box.fill('Step 1. start the subagents\n a. Explore: map it\n b. run `sleep 120` then answer')
    await box.press('Enter')
    const multi = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(multi.locator('code')).toHaveText('sleep 120', { timeout: 10_000 })
    const text = await multi.locator('.bubble > .md').innerText()
    expect(text.split('\n').filter(Boolean)).toEqual(['Step 1. start the subagents', 'a. Explore: map it', 'b. run sleep 120 then answer'])
  } finally {
    await shutdown()
  }
})
