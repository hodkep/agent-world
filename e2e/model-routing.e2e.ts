import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

// Ada asks for a subagent with no program and no model, only the kind of work; the office starts it on the model picked for that work.
const spawnOn = async (runnerMode: string, kind: string, extra: Record<string, string> = {}) => {
  const home = mkdtempSync(join(tmpdir(), 'aw-route-'))
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ runnerMode }))
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '300', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SPAWN: `ada:-:work on the exporter (${kind})`, FAKE_SPAWN_KIND: kind, ...extra },
    home
  )
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
  await page.reload()
  await hire(page)
  await approve(page).catch(() => {})
  await page.locator('.roster button', { hasText: 'ada' }).click()
  await expect(page.locator('.term-host:visible')).toContainText(/spawn_subagent → /, { timeout: 60_000 })
  return { app, page, home, shutdown }
}

for (const [kind, model] of [['edit', 'haiku'], ['review', 'opus']] as const)
  test(`automatic routing starts a ${kind} subagent on ${model}`, async () => {
    const { page, shutdown } = await spawnOn('auto', kind)
    try {
      await expect(page.locator('.term-host:visible')).toContainText(`"model":"${model}"`)
      const [ada] = await page.evaluate(() => window.aw.listAgents())
      const subs = await page.evaluate((id) => window.aw.subagents(id), ada!.id)
      expect(subs).toHaveLength(1)
      expect(subs[0]!.model).toMatch(new RegExp(model, 'i'))
      if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/routing-auto-${kind}.png` })
    } finally {
      await shutdown()
    }
  })

test('without automatic routing a subagent asked for with no model gets its program\'s default', async () => {
  const { page, shutdown } = await spawnOn('suggest', 'edit')
  try {
    await expect(page.locator('.term-host:visible')).toContainText('"status":"done"')
    await expect(page.locator('.term-host:visible')).not.toContainText('"model":"haiku"')
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/routing-suggest.png` })
  } finally {
    await shutdown()
  }
})

test('a rated subagent moves its model\'s score, and Settings shows the benchmark, the runs and the score they make together', async () => {
  const { page, home, shutdown } = await spawnOn('auto', 'edit', { FAKE_RATE: 'accepted' })
  try {
    await expect(page.locator('.term-host:visible')).toContainText('rate_subagent → Noted: haiku accepted. It has 1 accepted of 1 rated runs.')
    expect(readFileSync(join(home, 'runs.jsonl'), 'utf8')).toContain('"model":"haiku","outcome":"accepted"')
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'New agents' }).click()
    const routing = dialog.getByRole('group', { name: 'Model routing' })
    await expect(routing.getByRole('radio', { name: /Automatic/ })).toBeChecked()
    // Haiku: benchmark 70, one accepted run of one, so (70.4 x 10 + 100 x 1) / 11 = 73.
    const row = routing.getByRole('row', { name: /claude-haiku-5-5/ })
    await expect(row).toContainText('70')
    await expect(row).toContainText('1 of 1 accepted')
    await expect(row).toContainText('73')
    await expect(routing.getByRole('row', { name: /claude-sonnet-5-5/ })).toContainText('none yet')
    // The switch is saved as it is changed.
    await routing.getByRole('radio', { name: /Suggest/ }).check()
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ runnerMode: 'suggest' })
    await routing.getByRole('radio', { name: /Automatic/ }).check()
    if (process.env.AW_SHOTS) await routing.screenshot({ path: `${process.env.AW_SHOTS}/routing-settings.png` })
  } finally {
    await shutdown()
  }
})
