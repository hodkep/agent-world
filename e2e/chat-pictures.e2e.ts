import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
const LONG = 'The image should be separate and the message should be trimmed separately, not the images with it. We could show a count of the rest. And when it is open there should be buttons to switch between them, which are not automatic, and that work with the arrow keys on the keyboard. One more sentence to make this long enough to be trimmed in the bubble.'

test('the pictures of a sent message are a row of their own, the words are trimmed by themselves, and the viewer steps through them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-pics-'))
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const log = page.getByRole('log', { name: 'Conversation with ada' })

    await page.locator('.composer input[type=file]').setInputFiles(['one.png', 'two.png', 'three.png', 'four.png', 'five.png'].map((name) => ({ name, mimeType: 'image/png', buffer: PNG })))
    await expect(page.getByRole('list', { name: 'Attached files' })).toContainText('five.png')
    await box.fill(LONG)
    await box.press('Enter')

    // Three tiles and "+2 more": the pictures are a row above the bubble, not names inside it.
    const msg = log.locator('.msg.user').first()
    const gallery = msg.getByRole('group', { name: /5 pictures/ })
    await expect(gallery).toBeVisible({ timeout: 15_000 })
    await expect(gallery.locator('.tile:not(.more-t)')).toHaveCount(3)
    await expect(gallery.locator('.more-t')).toContainText('+2')
    await expect(msg.locator('.mention-row')).toHaveCount(0)
    // The tiles are named as the pictures were, without the time the app put in front of the name when it kept them.
    await expect(gallery.locator('.tile-n').first()).toHaveText('one.png')
    await expect(msg.locator('.bubble')).toContainText('The image should be separate')
    const bubble = (await msg.locator('.bubble').boundingBox())!
    const row = (await gallery.boundingBox())!
    expect(row.y + row.height).toBeLessThanOrEqual(bubble.y + 1)
    // The words are trimmed on their own.
    await expect(msg.getByRole('button', { name: 'Show more' })).toBeVisible()

    // A tile opens the viewer on that picture; the buttons and the arrow keys step, and the ends stop.
    await gallery.locator('.tile').first().click()
    const viewer = page.getByRole('dialog', { name: /^Picture 1 of 5/ })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByRole('button', { name: 'Previous picture' })).toBeDisabled()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: 'Picture 2 of 5' })).toBeVisible()
    await page.getByRole('button', { name: 'Next picture' }).click()
    await expect(page.getByRole('dialog', { name: 'Picture 3 of 5' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('dialog', { name: 'Picture 2 of 5' })).toBeVisible()
    // Nothing moves by itself.
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog', { name: 'Picture 2 of 5' })).toBeVisible()
    await page.getByRole('button', { name: /^Picture 5:/ }).click()
    await expect(page.getByRole('dialog', { name: 'Picture 5 of 5' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next picture' })).toBeDisabled()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('dialog', { name: 'Picture 5 of 5' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: /^Picture/ })).toHaveCount(0)

    // "+2 more" opens the viewer on the first one that was not shown.
    await gallery.locator('.more-t').click()
    await expect(page.getByRole('dialog', { name: 'Picture 4 of 5' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
