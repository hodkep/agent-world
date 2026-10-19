import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { shot } from './wf-helpers'

// Resting on the project button (or the agent number) opens a grid panel; one click on a tile switches; a click on the button keeps it open until a click elsewhere.
async function office(names: string[], missing?: string) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-quick-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const paths = names.map((n) => join(tmp, n))
  for (const p of paths) if (!p.endsWith(missing ?? '\0')) (mkdirSync(p), execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: p }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: paths[0], recent: paths }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), paths[0]!)
  await page.reload()
  return { page, shutdown }
}

test('the project switcher opens on hover, switches in one click, closes when the pointer leaves, and a click keeps it open until a click elsewhere', async () => {
  const names = Array.from({ length: 11 }, (_, i) => `proj-${String(i).padStart(2, '0')}`)
  const { page, shutdown } = await office(names, 'proj-09')
  try {
    const button = page.locator('.ws-button')
    await expect(button).toContainText('proj-00')
    const panel = page.getByRole('menu', { name: 'Projects' })
    // Resting on the button opens the panel; the project that is open is marked.
    await button.hover()
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /proj-/ })).toHaveCount(11)
    await expect(panel.locator('.wt.on')).toContainText('proj-00')
    await expect(panel.locator('.identicon')).toHaveCount(11)
    await page.waitForTimeout(300)
    await shot(page, 'quick-1-projects')
    // A project whose folder is gone is shown dimmed and cannot be picked.
    await expect(panel.getByRole('menuitem', { name: /proj-09/ })).toBeDisabled()
    // More than eight: a search box, and Enter opens the first match.
    const find = panel.getByRole('textbox', { name: /Find in projects/ })
    await find.fill('proj-03')
    await expect(panel.getByRole('menuitem', { name: /proj-/ })).toHaveCount(1)
    await find.fill('')
    // Leaving closes it (after a moment).
    await page.mouse.move(700, 600)
    await expect(panel).toBeHidden()
    // A click keeps it open when the pointer leaves, until a click elsewhere.
    await button.click()
    await page.mouse.move(700, 600)
    await page.waitForTimeout(700)
    await expect(panel).toBeVisible()
    await page.mouse.click(700, 600)
    await expect(panel).toBeHidden()
    // One click on a tile switches and closes.
    await button.hover()
    await panel.getByRole('menuitem', { name: /proj-02/ }).click()
    await expect(button).toContainText('proj-02')
    await expect(panel).toBeHidden()
  } finally {
    await shutdown()
  }
})

test('the project panel scrolls when its tiles do not fit, keeping its footer, and works from the keyboard', async () => {
  const names = Array.from({ length: 12 }, (_, i) => `proj-${String(i).padStart(2, '0')}`)
  const { page, shutdown } = await office(names)
  try {
    await page.setViewportSize({ width: 1200, height: 520 })
    const button = page.locator('.ws-button')
    await button.click()
    const panel = page.getByRole('menu', { name: 'Projects' })
    const grid = panel.locator('.qg')
    // Taller than the panel lets it be: the grid scrolls inside it and the footer stays in view.
    expect(await grid.evaluate((g) => g.scrollHeight > g.clientHeight)).toBe(true)
    await expect(panel.getByRole('menuitem', { name: 'Open another folder…' })).toBeInViewport()
    await page.waitForTimeout(300)
    await shot(page, 'quick-2-scroll')
    await grid.evaluate((g) => g.scrollTo(0, g.scrollHeight))
    await expect(panel.getByRole('menuitem', { name: /proj-11/ })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    // Keyboard: Down on the button opens it and lands on the first tile, arrows move, a number picks, Esc closes.
    await button.focus()
    await page.keyboard.press('ArrowDown')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /proj-00/ })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(panel.getByRole('menuitem', { name: /proj-01/ })).toBeFocused()
    await page.keyboard.press('3')
    await expect(button).toContainText('proj-02')
  } finally {
    await shutdown()
  }
})

test('the agent switcher is the same panel: resting on the number opens a grid of agents, one click selects one', async () => {
  const { page, shutdown } = await office(['shop'])
  try {
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'bo' })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const button = page.locator('.hc-switch')
    await button.hover()
    const panel = page.getByRole('menu', { name: 'Agents' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /ada|bo/ })).toHaveCount(2)
    await expect(panel.locator('.identicon')).toHaveCount(2)
    await page.waitForTimeout(300)
    await shot(page, 'quick-3-agents')
    await panel.getByRole('menuitem', { name: /ada/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    await expect(panel).toBeHidden()
    // A click keeps it open until a click elsewhere.
    await button.click()
    await page.mouse.move(300, 700)
    await page.waitForTimeout(700)
    await expect(panel).toBeVisible()
    await page.mouse.click(300, 700)
    await expect(panel).toBeHidden()
  } finally {
    await shutdown()
  }
})
