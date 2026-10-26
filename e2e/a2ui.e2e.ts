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

test('a diagram in a reply opens large on a click, where boxes (not arrows) are picked and it can be zoomed and drawn on; in the chat Shift+click picks and one button adds it to the message box', async () => {
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

    // In the chat there is one button; four are gone.
    await expect(bar.getByRole('button')).toHaveCount(1)
    await expect(bar.getByRole('button', { name: 'Add to message' })).toBeVisible()
    // Shift+click picks a box here, and the button then asks about it.
    await diagram.locator('.rough-node', { hasText: 'android-api' }).click({ modifiers: ['Shift'] })
    await expect(bar).toContainText('1 picked')
    await bar.getByRole('button', { name: 'Ask about them' }).click()
    await expect(chips.locator('li.chip-context')).toHaveCount(1)
    await expect(chips.locator('li.chip-context .chip-from')).toHaveText('Diagram')
    await expect(chips.locator('li.chip-context')).toContainText('diagram, picked android-api')
    await expect(chips.locator('li.chip-context')).toHaveAttribute('title', /I picked these boxes[\s\S]*android-api[\s\S]*```mermaid/)

    // A plain click opens it large, with the zoom controls.
    await diagram.locator('.dia-svg').click({ position: { x: 5, y: 5 } })
    const viewer = page.getByRole('dialog', { name: 'Diagram' })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByText('100%')).toBeVisible()
    await viewer.getByRole('button', { name: 'Zoom in' }).click()
    await expect(viewer.getByText('125%')).toBeVisible()
    await viewer.getByRole('button', { name: 'Fit' }).click()
    await expect(viewer.getByText('100%')).toBeVisible()

    // Boxes are picked by a click, several of them; an arrow cannot be.
    const picked = viewer.getByRole('list', { name: 'Picked boxes' })
    await viewer.locator('.rough-node', { hasText: 'Postgres' }).click()
    await viewer.locator('.rough-node', { hasText: 'Mage pipelines' }).click()
    await expect(picked.getByRole('listitem')).toHaveCount(2)
    await viewer.locator('.edgePaths path').first().click({ force: true })
    await expect(picked.getByRole('listitem')).toHaveCount(2)
    await viewer.getByRole('button', { name: 'Let go of Mage pipelines' }).click()
    await expect(picked.getByRole('listitem')).toHaveCount(1)
    await viewer.getByRole('button', { name: 'Ask about it' }).click()
    await expect(viewer).toHaveCount(0)
    await expect(chips.locator('li.chip-context')).toHaveCount(2)
    await expect(chips.locator('li.chip-context').nth(1)).toContainText('diagram, picked Postgres')

    // Draw is the picture editor; what is drawn is saved as a picture next to the diagram's words.
    await diagram.locator('.dia-svg').click({ position: { x: 5, y: 5 } })
    await viewer.getByRole('button', { name: 'Draw' }).click()
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
    await expect(chips.locator('li.chip-context')).toHaveCount(3)
    await expect(chips.locator('li.chip-context button.chip-img')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})
