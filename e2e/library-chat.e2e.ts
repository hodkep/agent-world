import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('chat: margin notes under a message say what the library did for it, and open to the exact words', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-libchat-'))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    // One item pointed at when a message is about PDFs, and one told every time.
    await page.evaluate(async (folder) => {
      const pdf = await window.aw.library.save({ kind: 'prompt', name: 'pdf', description: 'Work with PDFs.', body: 'Split with the helper.' })
      const terse = await window.aw.library.save({ kind: 'instruction', name: 'Terse', description: 'Talk short.', body: 'Talk short.' })
      await window.aw.library.setPlaybook(folder, [{ id: pdf.id, mode: 'on-demand', when: 'split a pdf into pages', strength: 'soft' }, { id: terse.id, mode: 'always', when: '', strength: 'soft' }])
    }, home)
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('hello there')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.user')).toContainText('hello there')
    // The answer is in the transcript, so the message has its time and what the hook does next lands after it.
    await expect(log.locator('.msg.assistant').first()).toBeVisible()

    // The program's own hook runs for a message and points at the item (the fake sends its own for the message above, which matches nothing, so this one is the pointing); the agent then reads it with its Skill tool.
    await expect.poll(() => readFileSync(args, 'utf8').includes('--settings')).toBe(true)
    const line = readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const hook = JSON.parse(readFileSync(line[line.indexOf('--settings') + 1]!, 'utf8')).hooks.UserPromptSubmit[0].hooks[0] as { url: string; headers: Record<string, string> }
    const session_id = line[line.indexOf('--session-id') + 1]
    const post = (body: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })
    await post({ hook_event_name: 'UserPromptSubmit', session_id, prompt: 'please split this pdf into pages' })
    await page.waitForTimeout(1200)
    await post({ hook_event_name: 'PreToolUse', session_id, tool_name: 'Skill', tool_input: { skill: 'agent-world-library:pdf' } })

    const slips = log.getByLabel('What the library did here')
    await expect(slips.getByRole('button', { name: /Told at the start/ })).toBeVisible()
    const note = slips.getByRole('button', { name: /pdf/ })
    await expect(note).toContainText('pointed, then read')
    await note.click()
    await expect(log.getByRole('group', { name: 'pdf, the words' })).toContainText('pdf covers this kind of work')
    await note.click()
    await expect(log.getByRole('group', { name: 'pdf, the words' })).toHaveCount(0)

    // The agent's Library tab tells the same story: what it was told, and what it did about it.
    await page.getByRole('tab', { name: 'Library' }).click()
    const tab = page.getByRole('tabpanel', { name: 'Library' })
    await expect(tab).toContainText('pointed at 1 item')
    await expect(tab.getByLabel('What it was told')).toContainText('split a pdf into pages: pdf')
    await expect(tab.getByLabel('What it did')).toContainText('Pointed at pdf')
    await expect(tab.getByLabel('What it did')).toContainText('Read pdf')

    // The top bar's Library: the item shows under "Reached for", with a verdict in words (too few pointings to judge yet).
    await page.locator('header').getByRole('button', { name: 'Library', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Library' })
    await dialog.getByRole('tab', { name: 'Reached for' }).click()
    const rows = dialog.getByLabel('Items agents were pointed at')
    await expect(rows).toContainText('pdf')
    await expect(rows).toContainText('Too few to judge yet')

    await dialog.getByRole('tab', { name: 'Playbook' }).click()
    // Changing the playbook now leaves ada on the older text, which the pane says, and one click restarts her on the new one.
    await expect(dialog.getByLabel('Who has this text')).toContainText('ada')
    await expect(dialog.getByLabel('Who has this text')).toContainText('up to date')
    await dialog.getByRole('radiogroup', { name: 'Firmness of pdf' }).getByRole('radio', { name: 'hard' }).click()
    const stale = dialog.getByRole('note').filter({ hasText: 'before you changed this playbook' })
    await expect(stale).toContainText('ada')
    await expect(dialog.getByLabel('Who has this text')).toContainText('started on an older text')
    await stale.getByRole('button', { name: 'Restart 1 agent' }).click()
    await expect(stale).toHaveCount(0, { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})
