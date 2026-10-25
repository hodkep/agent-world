import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('markdown is drawn rendered in the message box as you type, its markers hidden away from the caret, and the sent text is what was typed', async () => {
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
    // The text is kept as typed; what is drawn leaves out the markers that are hidden.
    const typed = () => box.getAttribute('data-text')

    await box.fill('plain words')
    await expect(preview).toHaveCount(0)

    // Commands, plugin skills and files are tinted wherever they are in the message, not only at the start.
    await box.fill('please run /compact then /impeccable:polish on @src/app.ts')
    await expect(box.locator('.tok-command')).toHaveText('/compact')
    await expect(box.locator('.tok-plugin')).toHaveText('/impeccable:polish')
    await expect(box.locator('.tok-file')).toHaveText('@src/app.ts')

    // Rendered where it is typed: a heading is big and its hashes are hidden once the caret is on another line.
    await box.fill('# Plan\n- one\n> said')
    await box.press('ControlOrMeta+Home')
    await expect(box.locator('.lm-h1')).toHaveText('# Plan')
    await box.press('ArrowDown')
    await expect(box.locator('.lm-h1')).toHaveText('Plan')
    // On the bullet's own line it shows as typed; one line further down it is drawn as a bullet and the quote shows its mark.
    await expect(box.locator('.lm-bullet')).toHaveCount(0)
    await box.press('ArrowDown')
    await expect(box.locator('.lm-bullet')).toHaveText('•')
    await expect(box.locator('.lm-quote')).toHaveText('> said')
    const big = await box.locator('.lm-h1').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
    const small = await box.locator('.lm-bullet').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
    expect(big).toBeGreaterThan(small)
    expect(await typed()).toBe('# Plan\n- one\n> said')
    await page.screenshot({ path: join(tmpdir(), 'aw-composer-live-block.png') })

    // The markers come back on the line the caret goes to.
    await box.press('ControlOrMeta+Home')
    await expect(box.locator('.lm-h1')).toHaveText('# Plan')

    await box.fill('make it **bold** and *soft* and `code` please\n\n```\nls -la\n```\n\nafter')
    await expect(box.locator('.lm-bold')).toHaveText('bold')
    await expect(box.locator('.lm-italic')).toHaveText('soft')
    await expect(box.locator('.lm-code')).toHaveText('code')
    await expect(box.locator('.lm-codeline')).toHaveText('ls -la')
    await expect(preview).toHaveCount(0)
    await page.screenshot({ path: join(tmpdir(), 'aw-composer-live-inline.png') })

    // Typing into a rendered line goes where the caret is, and the text is what was typed, hidden markers and all.
    await box.press('ControlOrMeta+Home')
    await box.press('End')
    await box.pressSequentially(' now')
    expect(await typed()).toBe('make it **bold** and *soft* and `code` please now\n\n```\nls -la\n```\n\nafter')

    await box.press('Enter')
    const sent = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(sent.locator('strong')).toHaveText('bold', { timeout: 10_000 })
    await expect(sent.locator('pre')).toContainText('ls -la')
    await expect(sent.locator('code').first()).toHaveText('code')
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
