import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const NAMES = [...['esuchi-development-portal', 'esuchi-development-admin', 'esuchi-gov-integration', 'esuchi-gov-notifications', 'esuchi-gov-reports', 'esuchi-shared-ui']].sort()

test('code: in a folder of several repositories, two chips show the repository names in full and the others are in the menu by their full names', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-repos-'))
  const proj = join(home, 'proj')
  for (const n of NAMES) {
    const d = join(proj, n)
    mkdirSync(d, { recursive: true })
    execFileSync('git', ['init', '-q'], { cwd: d })
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: d })
  }
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), proj)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Code' }).click()
    const strip = page.getByRole('group', { name: 'Repositories in this folder' })
    const chips = strip.locator('button.chip.name')
    await expect(chips).toHaveCount(2)
    await expect(strip.getByRole('button', { name: /^\+4 more/ })).toBeVisible()
    // Whatever the width, no name is cut: its text is wholly drawn.
    for (const c of await chips.all()) {
      const cut = await c.locator('span').first().evaluate((e) => e.scrollWidth > e.clientWidth)
      expect(cut).toBe(false)
    }
    await expect(chips.nth(0)).toContainText(NAMES[0]!)
    await expect(chips.nth(1)).toContainText(NAMES[1]!)
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-repos.png` })
    // The others are in the menu, each by its whole name, and picking one gives it a chip.
    await strip.getByRole('button', { name: /^\+4 more/ }).click()
    for (const n of NAMES.slice(2)) await expect(strip.locator('.pop .r', { hasText: n })).toBeVisible()
    await strip.locator('.pop .r', { hasText: NAMES[5]! }).click()
    await expect(chips.nth(1)).toContainText(NAMES[5]!)
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await shutdown()
  }
})
