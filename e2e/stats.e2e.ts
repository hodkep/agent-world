import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-stats-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_TRANSCRIPT: '1', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_COST: '1.5' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  return { page, shutdown, ledger: join(tmp, 'home', 'ledger.jsonl') }
}

test('the top bar buttons are icons that name themselves at once, and Usage and Weekly Rewind show what was spent', async () => {
  const { page, shutdown, ledger } = await start()
  try {
    const header = page.locator('header')
    // Icons only: the names are not drawn on the buttons.
    for (const name of ['History', 'Grid', 'Settings', 'Usage', 'Weekly Rewind']) {
      const b = header.getByRole('button', { name, exact: true })
      await expect(b).toHaveText('')
      await b.hover()
      // No delay: the hint is fully visible right away.
      expect(await b.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('1')
      expect(await b.getAttribute('data-tip')).toContain(name)
    }
    // The office-wide total is gone (each agent's cost is on the canvas and in the chat), and Grid shows when it is on.
    await expect(page.locator('.office-cost')).toHaveCount(0)
    const grid = header.getByRole('button', { name: 'Grid', exact: true })
    expect(await grid.getAttribute('aria-pressed')).toBe('false')
    const off = await grid.evaluate((el) => getComputedStyle(el).backgroundColor)
    await grid.click()
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    expect(await grid.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(off)
    await grid.click()
    await expect.poll(() => { try { return readFileSync(ledger, 'utf8') } catch { return '' } }, { timeout: 15_000 }).toContain('"usd":1.5')

    await header.getByRole('button', { name: 'Usage', exact: true }).click()
    const usage = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    // It opens on the summary across providers; Claude Code's dollars are one click away.
    await expect(usage.locator('.st-card', { hasText: 'Spent, last 7 days' })).toContainText('$1.50')
    await usage.getByRole('button', { name: 'Open Claude Code' }).click()
    await expect(usage.locator('.st-card', { hasText: 'Today' })).toContainText('$1.50')
    await expect(usage.locator('.st-card', { hasText: 'Last 7 days' })).toContainText('$1.50')
    await usage.getByRole('button', { name: '90d' }).click()
    await expect(usage.locator('.st-card', { hasText: 'Last 90 days' })).toContainText('$1.50')
    await expect(usage.locator('.st-list li')).toHaveCount(1)
    // Cycling the range never makes the page wider than the window.
    for (const n of ['7d', '30d', '90d', '7d']) {
      await usage.getByRole('button', { name: n, exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    }
    // Hovering a column says its day and cost, at once.
    const today = usage.locator('.st-col').last()
    await today.hover()
    expect(await today.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('1')
    expect(await today.getAttribute('data-tip')).toContain('$1.50')
    // A click outside the dialog closes it.
    await page.mouse.click(5, 5)
    await expect(usage).toHaveCount(0)

    await header.getByRole('button', { name: 'Weekly Rewind', exact: true }).click()
    const week = page.getByRole('dialog', { name: 'Weekly Rewind' })
    await expect(week.locator('.st-card', { hasText: 'Cost' })).toContainText('$1.50')
    await expect(week.getByRole('button', { name: 'Next week' })).toBeDisabled()
    await week.getByRole('button', { name: 'Previous week' }).click()
    await expect(week.locator('.st-card', { hasText: 'Cost' })).toContainText('$0.00')
    await expect(week.getByText('Nothing recorded this week')).toBeVisible()
    await expect(week.getByRole('button', { name: 'Next week' })).toBeEnabled()
    await page.mouse.click(5, 5)
    await expect(week).toHaveCount(0)
    // The same goes for Settings and History.
    for (const name of ['Settings', 'History']) {
      await header.getByRole('button', { name, exact: true }).click()
      await expect(page.locator('dialog[open]')).toHaveCount(1)
      await page.mouse.click(5, 5)
      await expect(page.locator('dialog[open]')).toHaveCount(0)
    }
  } finally {
    await shutdown()
  }
})
