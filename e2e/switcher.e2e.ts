import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// Holding Ctrl and pressing Tab (agents) or Shift+] (projects) shows a bar of tiles; letting go of Ctrl switches, Esc stays, and a tap switches with no bar.
async function office(projects: string[]) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-switcher-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const paths = projects.map((n) => join(tmp, n))
  for (const p of paths) (mkdirSync(p), execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: p }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: paths[0], recent: paths }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), paths[0]!)
  await page.reload()
  return { page, shutdown }
}

test('agents: holding Ctrl and pressing Tab shows the bar, more presses step it, release switches, Esc stays, and a tap shows no bar', async () => {
  const { page, shutdown } = await office(['alpha'])
  try {
    for (const name of ['ada', 'bob', 'cy']) await hire(page, { name })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = (name: string) => page.getByRole('textbox', { name: `Message ${name}` })
    await expect(box('cy')).toBeVisible()
    const bar = page.getByRole('region', { name: 'Switch agent' })
    const on = bar.locator('.wt.on .wt-name')
    // Held: the bar opens on another agent, not the one you are on, and Tab goes on, Shift+Tab back.
    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await expect(bar).toBeVisible()
    await expect(bar.locator('.wt')).toHaveCount(3)
    // A cell holds its tile and nothing else: no stray words beside it.
    expect(await bar.locator('.sb-cell').evaluateAll((cells) => cells.flatMap((c) => [...c.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()).map((n) => n.textContent!.trim())))).toEqual([])
    const first = (await on.textContent())!
    expect(first).not.toBe('cy')
    await page.keyboard.press('Tab')
    await expect(on).not.toHaveText(first)
    const second = (await on.textContent())!
    await page.keyboard.press('Shift+Tab')
    await expect(on).toHaveText(first)
    // Nothing has switched yet.
    await expect(box('cy')).toBeVisible()
    await page.keyboard.up('Control')
    await expect(bar).toBeHidden()
    await expect(box(first)).toBeVisible()
    // Esc stays where you are, and the release after it does nothing.
    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await expect(bar).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bar).toBeHidden()
    await page.keyboard.up('Control')
    await expect(box(first)).toBeVisible()
    // A tap switches at once; the bar never has time to show.
    await page.keyboard.press('Control+Tab')
    await expect(box(first)).toBeHidden()
    await expect(bar).toBeHidden()
    expect(second).not.toBe(first)
  } finally {
    await shutdown()
  }
})

test('a mouse press on a tile of the bar switches to it, for agents and for projects', async () => {
  const { page, shutdown } = await office(['alpha', 'beta', 'gamma'])
  try {
    for (const name of ['ada', 'bob', 'cy']) await hire(page, { name })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = (name: string) => page.getByRole('textbox', { name: `Message ${name}` })
    await expect(box('cy')).toBeVisible()
    const bar = page.getByRole('region', { name: 'Switch agent' })
    await page.keyboard.down('Control')
    await page.keyboard.press('Tab')
    await expect(bar).toBeVisible()
    await bar.locator('.wt', { hasText: 'ada' }).click()
    await expect(bar).toBeHidden()
    await expect(box('ada')).toBeVisible()
    await page.keyboard.up('Control')
    await expect(box('ada')).toBeVisible()
    // The same for projects.
    const projects = page.getByRole('region', { name: 'Switch project' })
    await page.keyboard.down('Control')
    await page.keyboard.press('Shift+BracketRight')
    await expect(projects).toBeVisible()
    await projects.locator('.wt', { hasText: 'gamma' }).click()
    await expect(projects).toBeHidden()
    await expect(page.locator('.ws-button')).toContainText('gamma')
    await page.keyboard.up('Control')
  } finally {
    await shutdown()
  }
})

test('projects: holding Ctrl and pressing ] shows the bar, release switches to the next project, and [ goes back', async () => {
  const { page, shutdown } = await office(['alpha', 'beta', 'gamma'])
  try {
    const button = page.locator('.ws-button')
    await expect(button).toContainText('alpha')
    const bar = page.getByRole('region', { name: 'Switch project' })
    const on = bar.locator('.wt.on .wt-name')
    await page.keyboard.down('Control')
    await page.keyboard.press('Shift+BracketRight')
    await expect(bar).toBeVisible()
    await expect(bar.locator('.wt')).toHaveCount(3)
    const first = (await on.textContent())!
    expect(first).not.toBe('alpha')
    await page.keyboard.press('Shift+BracketRight')
    await expect(on).not.toHaveText(first)
    await page.keyboard.press('Shift+BracketLeft')
    await expect(on).toHaveText(first)
    await expect(button).toContainText('alpha')
    await page.keyboard.up('Control')
    await expect(bar).toBeHidden()
    await expect(button).toContainText(first)
  } finally {
    await shutdown()
  }
})
