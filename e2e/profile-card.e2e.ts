import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start(panelWidth?: number, extra: Record<string, string> = {}, openCard = true) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-card-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_COST: '1.5', FAKE_ARGS: join(tmp, 'launches.jsonl'), ...extra }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.evaluate(([f, w]) => (localStorage.setItem('aw.folder', f as string), w && localStorage.setItem('aw.panelw', String(w))), [dir, panelWidth])
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Chat' }).click()
  // Hiring opened the card, but clicking the Chat tab was a click outside it; the name brings it back.
  if (openCard) await page.locator('.hc-name').click()
  return { app, page, shutdown, launches: () => (existsSync(join(tmp, 'launches.jsonl')) ? readFileSync(join(tmp, 'launches.jsonl'), 'utf8') : '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]) }
}
const pixels = (page: Page) => page.evaluate(() => (() => { const c = document.querySelector<HTMLCanvasElement>('.pc-portrait canvas')!; return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).join(',') })())

test('clicking an agent opens its card on the side of the office away from it', async () => {
  const { page, shutdown } = await start()
  try {
    const card = page.locator('.profile-overlay')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(card.locator('.pc-name')).toHaveText('ada')
    // Gauges and tiles carry the numbers, each with a name for assistive technology.
    await expect(card.getByText('Context used')).toBeVisible()
    await expect(card.getByText('58% left')).toBeVisible()
    await expect(card.getByText('Spent')).toBeVisible()
    await expect(card.getByText('Settings', { exact: true })).toBeVisible()
    await expect(card.locator('.pc-tile', { hasText: 'hired' })).toContainText('new')
    // No picture-only controls: each setting says what it is in words.
    for (const word of ['Model', 'Thinking', 'Mode']) await expect(card.getByText(word, { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Compact the conversation' })).toContainText('Compact conversation')
    await expect(card.getByRole('region', { name: 'Profile of ada' })).toBeVisible()
    const stage = (await page.locator('.stage').boundingBox())!
    const box = (await card.boundingBox())!
    const side = await card.getAttribute('data-side')
    // ada sits at the first desk, in the left half of the office, so the card is on the right.
    expect(side).toBe('right')
    expect(box.x + box.width / 2).toBeGreaterThan(stage.x + stage.width / 2)
    // Everything the old text list held is on the card itself, and the list is gone.
    await expect(page.locator('.profile-facts')).toHaveCount(0)
    await expect(card).toContainText('Hired')
    await expect(card).toContainText('Sonnet')
    await expect(card).toContainText('$1.50')
    await expect(card.locator('.pc-branch')).toContainText('Branch')
  } finally {
    await shutdown()
  }
})

test('no card opens until asked for, not on hiring, picking an agent or after a reload', async () => {
  const { page, shutdown } = await start(undefined, {}, false)
  try {
    await expect(page.locator('.hc-name')).toHaveText('ada', { timeout: 15_000 })
    await expect(page.locator('.pc')).toHaveCount(0)
    await page.getByRole('button', { name: 'ada', exact: false }).first().click()
    await expect(page.locator('.pc')).toHaveCount(0)
    await page.locator('.hc-name').click()
    await expect(page.locator('.pc')).toHaveCount(1)
    await page.reload()
    await expect(page.locator('.hc-name')).toHaveText('ada', { timeout: 15_000 })
    await expect(page.locator('.pc')).toHaveCount(0)
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

test('the card closes with its × and when you click outside it, and there is no separate toggle button', async () => {
  const { page, shutdown } = await start()
  try {
    const card = page.locator('.profile-overlay')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Profile card', exact: true })).toHaveCount(0)
    await card.getByRole('button', { name: 'Close profile card' }).click()
    await expect(card).toHaveCount(0)
    // The name in the header brings it back; a click anywhere else sends it away again.
    await page.locator('.hc-name').click()
    await expect(card).toBeVisible()
    await page.locator('.chat').first().click({ position: { x: 40, y: 200 } })
    await expect(card).toHaveCount(0)
    await page.locator('.hc-name').click()
    await expect(card).toBeVisible()
    // Clicking inside the card (its settings, its name) does not close it.
    await card.getByRole('button', { name: /^Model:/ }).click()
    await expect(card.getByRole('menu', { name: 'Model' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(card.getByRole('menu', { name: 'Model' })).toHaveCount(0)
    await expect(card).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(card).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('with too little room over the office the card opens in the panel instead, and closes the same way', async () => {
  // A wide side panel leaves the office little room.
  const { page, shutdown } = await start(1000)
  try {
    await expect(page.locator('.profile-dock .pc-name')).toHaveText('ada', { timeout: 15_000 })
    await expect(page.locator('.profile-overlay')).toHaveCount(0)
    await page.locator('.profile-dock').getByRole('button', { name: 'Close profile card' }).click()
    await expect(page.locator('.profile-dock')).toHaveCount(0)
    await page.locator('.hc-name').click()
    await expect(page.locator('.profile-dock .pc-name')).toHaveText('ada')
  } finally {
    await shutdown()
  }
})

test('the card edits the agent: name, model, thinking level, mode and compact, each as the chat would', async () => {
  const { page, shutdown, launches } = await start()
  try {
    const card = page.locator('.profile-overlay')
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => launches().length, { timeout: 15_000 }).toBe(1)
    // Settings change while it is between turns, so wait for it to be idle.
    await expect(card.getByRole('button', { name: /^Thinking high/ })).toBeEnabled({ timeout: 20_000 })

    // Thinking level: the agent restarts on the same conversation with that level.
    await card.getByRole('button', { name: 'Thinking high' }).click()
    await expect.poll(() => launches().length, { timeout: 20_000 }).toBe(2)
    expect(launches()[1]).toEqual(expect.arrayContaining(['--effort', 'high']))
    await expect(card.getByRole('group', { name: /Thinking level: high/ })).toBeVisible()

    // Model, from a short list.
    await expect(card.getByRole('button', { name: /^Model:/ })).toBeEnabled({ timeout: 20_000 })
    await card.getByRole('button', { name: /^Model:/ }).click()
    await card.getByRole('menuitemradio', { name: 'Haiku' }).click()
    await expect.poll(() => launches().length, { timeout: 20_000 }).toBe(3)
    expect(launches()[2]).toEqual(expect.arrayContaining(['--model', 'haiku']))

    // Mode: the header reflects it.
    await expect(card.getByRole('button', { name: /^Mode:/ })).toBeEnabled({ timeout: 20_000 })
    await card.getByRole('button', { name: /^Mode:/ }).click()
    await card.getByRole('menuitemradio', { name: 'Edit automatically' }).click()
    await expect(page.locator('.hc-mode')).toHaveText('Edit automatically', { timeout: 15_000 })

    // Compact: the same command the chat sends.
    await expect(card.getByRole('button', { name: 'Compact the conversation' })).toBeEnabled({ timeout: 20_000 })
    await card.getByRole('button', { name: 'Compact the conversation' }).click()
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).getByText('/compact').first()).toBeVisible({ timeout: 15_000 })

    // Name: change it in place; the header and the card follow.
    await card.getByRole('button', { name: 'Rename ada' }).click()
    await card.getByRole('textbox', { name: 'New name' }).fill('zed')
    await card.getByRole('textbox', { name: 'New name' }).press('Enter')
    await expect(card.locator('.pc-name')).toHaveText('zed')
    await expect(page.locator('.hc-name')).toHaveText('zed')
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    expect(agent!.name).toBe('zed')
  } finally {
    await shutdown()
  }
})

test('the card has a toggle between its full and compact forms, and the full form shows everything', async () => {
  const { page, shutdown } = await start()
  try {
    const card = page.locator('.profile-overlay .pc')
    await expect(card).toHaveClass(/pc-full/, { timeout: 15_000 })
    await expect(card.getByText('So far')).toBeVisible()
    await expect(card.getByText('Level 1')).toBeVisible()

    await card.getByRole('button', { name: 'Show the compact card' }).click()
    await expect(card).toHaveClass(/pc-compact/)
    await expect(card.getByText('So far')).toHaveCount(0)
    await expect(card.getByText('Settings', { exact: true })).toBeVisible()

    // And back, as often as wanted.
    await card.getByRole('button', { name: 'Show the full card' }).click()
    await expect(card).toHaveClass(/pc-full/)
    await expect(card.getByText('So far')).toBeVisible()
    await expect(card.getByText('Level 1')).toBeVisible()
  } finally {
    await shutdown()
  }
})
