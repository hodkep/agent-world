import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

// Ada asks for subagents with no program and no model, only the kind of work; the office starts each on the model picked for that work.
const office = async (runnerMode: string, extra: Record<string, string> = {}) => {
  const home = mkdtempSync(join(tmpdir(), 'aw-route-'))
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ runnerMode }))
  const argv = join(home, 'argv.log')
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '300', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_ARGV_LOG: argv, ...extra },
    home
  )
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
  await page.reload()
  return { page, home, argv, shutdown }
}
const startAda = async (page: Page) => {
  await hire(page)
  await approve(page).catch(() => {})
  await page.locator('.roster button', { hasText: 'ada' }).click()
}
const modelsLaunched = (argv: string) => readFileSync(argv, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]).flatMap((a) => (a.includes('--model') ? [a[a.indexOf('--model') + 1]!] : []))
const shot = (name: string) => (process.env.AW_SHOTS ? `${process.env.AW_SHOTS}/${name}.png` : undefined)

test('automatic routing starts each subagent on the model picked for its kind of work, and the program is launched with it', async () => {
  const asks = [
    { kind: 'edit', task: 'rename the exporter\'s helper' },
    { kind: 'feature', vague: true, task: 'add an export endpoint, the spec is loose' },
    { kind: 'review', task: 'review the export design' }
  ]
  const { page, argv, shutdown } = await office('auto', { FAKE_SPAWN: 'ada:-:x', FAKE_SPAWNS: JSON.stringify(asks) })
  try {
    await startAda(page)
    await expect(page.locator('.term-host:visible')).toContainText(/review the export design/, { timeout: 90_000 })
    await expect(page.locator('.term-host:visible')).toContainText('"model":"opus"')
    // What the program was started with, not only what the card says: one subagent each on Haiku, Sonnet and Opus.
    expect(modelsLaunched(argv).sort()).toEqual(['haiku', 'opus', 'sonnet'])
    const panel = page.getByRole('complementary', { name: 'Subagents' })
    for (const [i, [pat, model]] of ([[/rename the exporter/, 'haiku'], [/add an export endpoint/, 'sonnet'], [/review the export design/, 'opus']] as const).entries()) {
      await panel.getByRole('tab', { name: pat }).click()
      await expect(panel).toContainText(`claude · ${model} · started by ada`)
      const box = (await panel.boundingBox())!
      const path = shot(`crop-${i + 1}-${asks[i]!.kind}`)
      if (path) await page.screenshot({ path, clip: { x: box.x, y: box.y, width: box.width, height: 215 } })
    }
  } finally {
    await shutdown()
  }
})

test('without automatic routing a subagent asked for with no model gets its program\'s default', async () => {
  const { page, argv, shutdown } = await office('suggest', { FAKE_SPAWN: 'ada:-:tidy the exporter', FAKE_SPAWN_KIND: 'edit' })
  try {
    await startAda(page)
    await expect(page.locator('.term-host:visible')).toContainText('"status":"done"', { timeout: 60_000 })
    await expect(page.locator('.term-host:visible')).not.toContainText('"model":"haiku"')
    expect(modelsLaunched(argv)).toEqual([])
  } finally {
    await shutdown()
  }
})

test('a rated subagent moves its model\'s score, and Settings shows the benchmark, the runs and the score they make together', async () => {
  const openRouting = async (page: Page) => {
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'New agents' }).click()
    return { dialog, routing: dialog.getByRole('group', { name: 'Model routing' }) }
  }
  // Before: no run has been rated.
  const first = await office('auto')
  try {
    const { routing } = await openRouting(first.page)
    await expect(routing.getByRole('row', { name: /claude-haiku-5-5/ })).toContainText('none yet')
    await expect(routing.getByRole('row', { name: /claude-haiku-5-5/ })).toContainText('70')
    const path = shot('score-1-before')
    if (path) await routing.getByRole('table', { name: 'Model scores' }).screenshot({ path })
  } finally {
    await first.shutdown()
  }
  // After: one Haiku run, rated accepted by the agent that asked for it.
  const { page, home, shutdown } = await office('auto', { FAKE_SPAWN: 'ada:-:tidy the exporter', FAKE_SPAWNS: JSON.stringify([{ kind: 'edit', task: 'tidy the exporter', rate: 'accepted' }]) })
  try {
    await startAda(page)
    await expect(page.locator('.term-host:visible')).toContainText('rate_subagent → Noted: haiku accepted. It has 1 accepted of 1 rated runs.', { timeout: 60_000 })
    expect(readFileSync(join(home, 'model-runs.jsonl'), 'utf8')).toContain('"model":"haiku","outcome":"accepted"')
    const { routing } = await openRouting(page)
    const row = routing.getByRole('row', { name: /claude-haiku-5-5/ })
    // (70.4 x 10 + 100 x 1) / 11 = 73; no other model has runs.
    await expect(row).toContainText('1 of 1 accepted')
    await expect(row).toContainText('73')
    await expect(routing.getByRole('row', { name: /claude-sonnet-5-5/ })).toContainText('none yet')
    const path = shot('score-2-after')
    if (path) await routing.getByRole('table', { name: 'Model scores' }).screenshot({ path })
    // The switch is saved as it is changed, in both directions.
    await routing.getByRole('radio', { name: /Suggest/ }).check()
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ runnerMode: 'suggest' })
    await routing.getByRole('radio', { name: /Automatic/ }).check()
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ runnerMode: 'auto' })
  } finally {
    await shutdown()
  }
})
