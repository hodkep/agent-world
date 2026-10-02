import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start(panelWidth?: number) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-card-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_COST: '1.5' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.evaluate(([f, w]) => (localStorage.setItem('aw.folder', f as string), w && localStorage.setItem('aw.panelw', String(w))), [dir, panelWidth])
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Chat' }).click()
  return { app, page, shutdown }
}
const pixels = (page: Page) => page.evaluate(() => Array.from(document.querySelector<HTMLCanvasElement>('.pc-portrait canvas')!.getContext('2d')!.getImageData(0, 0, 28, 38).data).join(','))

test('clicking an agent opens its card on the side of the office away from it, with the facts as text in the panel too', async () => {
  const { page, shutdown } = await start()
  try {
    const card = page.locator('.profile-overlay')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('.pc-name')).toHaveText('ada')
    await expect(card.locator('.pc-row', { hasText: 'Model' })).toContainText('Sonnet')
    await expect(card.locator('.pc-row', { hasText: 'Hired' })).toContainText('just now')
    await expect(card.locator('.pc-row', { hasText: 'Cost' })).toContainText('$1.50')
    // Decorative: hidden from assistive technology, because the panel says all of it in words.
    await expect(card).toHaveAttribute('aria-hidden', 'true')
    const stage = (await page.locator('.stage').boundingBox())!
    const box = (await card.boundingBox())!
    const side = await card.getAttribute('data-side')
    // ada sits at the first desk, in the left half of the office, so the card is on the right.
    expect(side).toBe('right')
    expect(box.x + box.width / 2).toBeGreaterThan(stage.x + stage.width / 2)
    await page.locator('.profile-facts summary').click()
    const facts = page.locator('.profile-facts')
    await expect(facts).toContainText('Hired')
    await expect(facts).toContainText('just now')
    await expect(facts).toContainText('Sonnet')
    await expect(facts).toContainText('$1.50')
  } finally {
    await shutdown()
  }
})

test('the figure moves, and holds still with reduced motion', async () => {
  const { page, shutdown } = await start()
  try {
    await expect(page.locator('.profile-overlay')).toBeVisible({ timeout: 15_000 })
    const a = await pixels(page)
    await page.waitForTimeout(1300)
    expect(await pixels(page)).not.toBe(a)
    expect(a).toContain('255')   // it drew something
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForTimeout(500)
    const still = await pixels(page)
    await page.waitForTimeout(1300)
    expect(await pixels(page)).toBe(still)
  } finally {
    await shutdown()
  }
})

test('the card can be hidden and the choice is kept', async () => {
  const { page, shutdown } = await start()
  try {
    await expect(page.locator('.profile-overlay')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Profile card' }).click()
    await expect(page.locator('.profile-overlay')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Profile card' })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.profile-overlay')).toHaveCount(0)
    await page.getByRole('button', { name: 'Profile card' }).click()
    await expect(page.locator('.profile-overlay')).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('with too little room over the office the card moves into the panel, folded until you open it', async () => {
  // A wide side panel leaves the office little room.
  const { page, shutdown } = await start(1000)
  try {
    await expect(page.locator('.profile-bar')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.profile-overlay')).toHaveCount(0)
    await expect(page.locator('.profile-dock')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show card' }).click()
    await expect(page.locator('.profile-dock .pc-name')).toHaveText('ada')
    await expect(page.getByRole('button', { name: 'Hide card' })).toBeVisible()
    // The facts as text are there either way.
    await page.locator('.profile-facts summary').click()
    await expect(page.locator('.profile-facts')).toContainText('Hired')
  } finally {
    await shutdown()
  }
})
