import { readdirSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const W = 400
const H = 300

/** A grey picture made in the page, so the test needs no image file. */
const grey = (page: Page) =>
  page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas')
      c.width = w!
      c.height = h!
      const x = c.getContext('2d')!
      x.fillStyle = '#888888'
      x.fillRect(0, 0, w!, h!)
      return c.toDataURL('image/png').split(',')[1]!
    },
    [W, H]
  )

/** The colour of one pixel of the picture being edited, in picture pixels. */
const pixel = (page: Page, x: number, y: number) =>
  page.getByLabel('Picture being edited').evaluate((c: HTMLCanvasElement, [px, py]) => [...c.getContext('2d')!.getImageData(px!, py!, 1, 1).data], [x, y])

test('an attached picture can be marked up full size, and the marked-up one is what gets attached', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-edit-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()

    await page.locator('.composer input[type=file]').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(await grey(page), 'base64') })
    const chip = page.getByRole('button', { name: 'Preview shot.png' })
    await expect(chip).toBeVisible()
    const before = await chip.locator('img').getAttribute('src')

    // Full size, with an Edit button.
    await chip.click()
    await expect(page.getByRole('dialog', { name: 'Picture' })).toBeVisible()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Edit shot.png' })
    await expect(editor).toBeVisible()
    const bar = editor.getByRole('toolbar', { name: 'Picture tools' })
    for (const name of ['Pen', 'Line', 'Arrow', 'Rectangle', 'Ellipse', 'Text', 'Hide (black out an area)']) await expect(bar.getByRole('radio', { name, exact: true })).toBeVisible()
    for (const name of ['Red', 'Blue', 'Green', 'Black', 'White']) await expect(bar.getByRole('radio', { name, exact: true })).toBeVisible()
    // The ring round the chosen colour is drawn inside the swatch, so no neighbour or edge can cut it off: first, middle and last.
    for (const name of ['Red', 'Green', 'White']) {
      const swatch = bar.getByRole('radio', { name, exact: true })
      await swatch.click()
      const shadows = (await swatch.evaluate((el) => getComputedStyle(el).boxShadow)).split(/,\s(?=rgba?\()/)
      const ring = shadows.filter((x) => x.startsWith('rgb(242, 194, 48)'))
      expect(ring.length).toBeGreaterThan(0)
      for (const r of ring) expect(r).toContain('inset')
      await bar.screenshot({ path: join(tmpdir(), `aw-swatch-${name.toLowerCase()}.png`) })
    }
    await bar.getByRole('radio', { name: 'Red', exact: true }).click()
    await expect(bar.getByRole('button', { name: 'Save' })).toBeDisabled() // nothing drawn yet
    await expect(bar.getByRole('button', { name: 'Undo' })).toBeDisabled()

    const canvas = page.getByLabel('Picture being edited')
    const box = (await canvas.boundingBox())!
    const at = (fx: number, fy: number) => ({ x: box.x + fx * box.width, y: box.y + fy * box.height })
    const drag = async (a: [number, number], b: [number, number]) => {
      const p = at(...a)
      const q = at(...b)
      await page.mouse.move(p.x, p.y)
      await page.mouse.down()
      await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2)
      await page.mouse.move(q.x, q.y)
      await page.mouse.up()
    }

    // A red rectangle: its left edge is red, the grey inside is untouched.
    await bar.getByRole('radio', { name: 'Rectangle', exact: true }).click()
    await drag([0.2, 0.2], [0.6, 0.6])
    const edge = await pixel(page, 0.2 * W, 0.4 * H)
    expect(edge[0]).toBeGreaterThan(180)
    expect(edge[1]).toBeLessThan(90)
    expect(await pixel(page, 0.4 * W, 0.4 * H)).toEqual([136, 136, 136, 255])

    // Undo takes it off, redo puts it back.
    await bar.getByRole('button', { name: 'Undo' }).click()
    expect(await pixel(page, 0.2 * W, 0.4 * H)).toEqual([136, 136, 136, 255])
    await bar.getByRole('button', { name: 'Redo' }).click()
    expect((await pixel(page, 0.2 * W, 0.4 * H))[0]).toBeGreaterThan(180)

    // Blue pen stroke, then Hide blacks an area out for good.
    await bar.getByRole('radio', { name: 'Blue', exact: true }).click()
    await bar.getByRole('radio', { name: 'Pen', exact: true }).click()
    await drag([0.1, 0.9], [0.5, 0.9])
    const stroke = await pixel(page, 0.3 * W, 0.9 * H)
    expect(stroke[2]).toBeGreaterThan(180)
    expect(stroke[0]).toBeLessThan(110)
    await bar.getByRole('radio', { name: 'Hide (black out an area)', exact: true }).click()
    await drag([0.7, 0.7], [0.9, 0.9])
    expect(await pixel(page, 0.8 * W, 0.8 * H)).toEqual([0, 0, 0, 255])

    // Text: click, type, Enter.
    await bar.getByRole('radio', { name: 'White', exact: true }).click()
    await bar.getByRole('radio', { name: 'Text', exact: true }).click()
    const t = at(0.65, 0.1)
    await page.mouse.click(t.x, t.y)
    await editor.getByLabel('Text to add').fill('look here')
    await page.keyboard.press('Enter')
    await expect(editor.getByLabel('Text to add')).toHaveCount(0)

    // Clear removes every mark, and undo brings them all back.
    await bar.getByRole('button', { name: 'Clear all marks' }).click()
    expect(await pixel(page, 0.8 * W, 0.8 * H)).toEqual([136, 136, 136, 255])
    await bar.getByRole('button', { name: 'Undo' }).click()
    expect(await pixel(page, 0.8 * W, 0.8 * H)).toEqual([0, 0, 0, 255])
    await page.screenshot({ path: join(tmpdir(), 'aw-image-editor.png') })

    // Close throws the edits away: the chip still has the original picture.
    await bar.getByRole('button', { name: 'Close' }).click()
    await expect(editor).toHaveCount(0)
    expect(await chip.locator('img').getAttribute('src')).toBe(before)

    // Edit again, draw one mark, Save: the chip now shows the edited picture, and that is the file attached.
    await chip.click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await bar.getByRole('radio', { name: 'Hide (black out an area)', exact: true }).click()
    await drag([0.1, 0.1], [0.3, 0.3])
    await bar.getByRole('button', { name: 'Save' }).click()
    await expect(editor).toHaveCount(0)
    await expect(chip.locator('img')).not.toHaveAttribute('src', before!)
    const dir = join(home, 'aw', 'attachments')
    const saved = readdirSync(join(dir, readdirSync(dir)[0]!)).sort()
    expect(saved).toHaveLength(2) // the original and the edited one
    const edited = readFileSync(join(dir, readdirSync(dir)[0]!, saved[1]!))
    expect(edited.subarray(1, 4).toString()).toBe('PNG')
    expect(edited.byteLength).toBeGreaterThan(0)

    // The edited picture is what is mentioned to the agent when the message is sent.
    await page.getByRole('textbox', { name: 'Message ada' }).fill('see the marks')
    await page.getByRole('textbox', { name: 'Message ada' }).press('Enter')
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.pic img').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await shutdown()
  }
})

test('Escape leaves the editor without keeping anything', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-edit2-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.locator('.composer input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(await grey(page), 'base64') })
    await page.getByRole('button', { name: 'Preview a.png' }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Edit a.png' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Edit a.png' })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Attached files' })).toContainText('a.png')
  } finally {
    await shutdown()
  }
})
