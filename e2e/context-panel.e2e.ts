import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

// One agent whose context climbs to 300k and is compacted to 40k, and one that stays small: the Context size section says where the cost went and what the compaction did.
test('the Tokens tab shows how big each agent\'s context got, with its compaction, and what a smaller one would have saved', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-context-'))
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  const start = Date.now() - 3 * 3_600_000
  const req = (i: number, agent: string, name: string, ctx: number) => ({ k: 'req', t: start + i * 60_000, agent, name, project: 'web', model: 'claude-sonnet-5-5', provider: 'claude', input: 2, cacheRead: ctx - 2, cacheWrite: 0, output: 100 })
  const climb = Array.from({ length: 60 }, (_, i) => req(i, 'a', 'Charlie', Math.round(50_000 + (i * 250_000) / 59)))
  const after = [40_000, 41_000, 42_000, 43_000, 44_000].map((c, i) => req(60 + i, 'a', 'Charlie', c))
  const small = Array.from({ length: 10 }, (_, i) => req(i, 'b', 'Maya', 60_000))
  writeFileSync(join(home, 'ledger.jsonl'), [...climb, ...after, ...small].map((e) => JSON.stringify(e)).join('\n') + '\n')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1100 })
    await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const usage = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    await usage.getByRole('tab', { name: 'Tokens' }).click()
    const ctx = usage.locator('.cx')
    await expect(ctx.getByRole('heading', { name: /Context size/ })).toBeVisible()

    // All: the three bands as a bar, nothing before to compare with, and the office in a sentence.
    await expect(ctx.locator('.cx-bar')).toBeVisible()
    await expect(ctx.locator('.cx-trend')).toContainText('nothing recorded in the days before')
    await expect(ctx.locator('.cx-ins')).toContainText('of the cost came from the')

    // Charlie: the chart, its compaction as a chip, and three sentences.
    await ctx.getByRole('group', { name: 'Show context of' }).getByRole('button', { name: 'Charlie' }).click()
    await expect(ctx.getByRole('img', { name: /Charlie's context.*peaking at 300k, compacted 1 times/ })).toBeVisible()
    await expect(ctx.locator('.cx-chip')).toHaveText('compacted 300k → 40k')
    await expect(ctx.locator('.cx-ins')).toContainText('Charlie spent')
    await expect(ctx.locator('.cx-ins')).toContainText('It was compacted once: the last time from 300k to 40k.')
    await expect(ctx.locator('.cx-ins')).toContainText('Holding it to 100k would have saved about')
    if (process.env.AW_SHOTS) await ctx.screenshot({ path: `${process.env.AW_SHOTS}/usage-context.png` })

    // Maya never compacted, and has no chip.
    await ctx.getByRole('group', { name: 'Show context of' }).getByRole('button', { name: 'Maya' }).click()
    await expect(ctx.locator('.cx-ins')).toContainText('It never compacted: its context only grew.')
    await expect(ctx.locator('.cx-chip')).toHaveCount(0)
    await ctx.getByRole('group', { name: 'Show context of' }).getByRole('button', { name: 'All' }).click()
    await expect(ctx.locator('.cx-bar')).toBeVisible()
  } finally {
    await shutdown()
  }
})
