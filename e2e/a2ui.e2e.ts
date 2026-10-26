import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a reply can hold a diagram and a form the agent drew: the diagram is a picture, the form answers the agent when its button is pressed, and a block that is not a form stays as written', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-a2ui-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: resolve(__dirname, 'fixtures/a2ui-reply.md') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    await expect(log.locator('.mermaid svg')).toBeVisible({ timeout: 20_000 })
    const form = log.locator('.a2ui')
    await expect(form).toHaveCount(1)
    await expect(form.getByRole('heading', { name: 'Which pipeline first?' })).toBeVisible()
    // Not a surface: shown as the code it is.
    await expect(log.locator('pre code.language-a2ui')).toContainText('this')

    // The data the agent gave is what the form starts with, and it is changed by hand.
    await expect(form.getByLabel('hourly')).toBeChecked()
    await form.getByLabel('daily').check()
    await form.getByLabel('Dry run only').check()
    await form.getByLabel(/Batch size/).fill('2500')

    await form.getByRole('button', { name: 'Start' }).click()
    // What the agent is told is the A2UI action, with the values read from the form as it was left.
    const said = log.getByText(/A2UI action "start_fix"/)
    await expect(said).toBeVisible()
    await expect(said).toContainText('"pipeline":["daily"]')
    await expect(said).toContainText('"batch":2500')
    await expect(said).toContainText('"dry":true')
    // Pressed once: it cannot be sent again from the same form.
    await expect(form.getByRole('button', { name: 'Start' })).toBeDisabled()
  } finally {
    await shutdown()
  }
})

test('a diagram in a reply can be picked from, zoomed, drawn on and added to the message box', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-diagram-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: resolve(__dirname, 'fixtures/a2ui-reply.md') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const diagram = log.locator('.dia')
    await expect(diagram.locator('svg')).toBeVisible({ timeout: 20_000 })
    const bar = diagram.getByRole('toolbar', { name: 'Diagram' })
    const chips = page.getByRole('list', { name: 'Attached files' })

    // A box is picked by a click, one at a time, more with Shift, and let go by clicking it again.
    await diagram.locator('.rough-node', { hasText: 'android-api' }).click()
    await expect(bar).toContainText('1 picked')
    await diagram.locator('.rough-node', { hasText: 'Postgres' }).click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('2 picked')
    await diagram.locator('.rough-node', { hasText: 'Postgres' }).click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('1 picked')

    // Asking about it adds one chip with the diagram's words and the box picked, and clears the pick.
    await bar.getByRole('button', { name: 'Ask about them' }).click()
    await expect(chips.locator('li.chip-context')).toHaveCount(1)
    await expect(chips.locator('li.chip-context .chip-from')).toHaveText('Diagram')
    await expect(chips.locator('li.chip-context')).toContainText('diagram, picked android-api')
    await expect(chips.locator('li.chip-context')).toHaveAttribute('title', /```mermaid[\s\S]*android-api/)
    await expect(bar).not.toContainText('picked')

    // Zoom is the picture viewer: it opens on the diagram as a picture and Esc closes it.
    await bar.getByRole('button', { name: 'Zoom' }).click()
    await expect(page.getByRole('dialog', { name: 'Picture' }).locator('img')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Picture' })).toHaveCount(0)

    // Draw is the picture editor; what is drawn is saved as a picture next to the diagram's words.
    await bar.getByRole('button', { name: 'Draw' }).click()
    const editor = page.getByRole('dialog', { name: 'Edit diagram.png' })
    const canvas = editor.getByLabel('Picture being edited')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 })
    await page.mouse.up()
    await editor.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toHaveCount(0)
    await expect(chips.locator('li.chip-context')).toHaveCount(2)
    await expect(chips.locator('li.chip-context button.chip-img')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
