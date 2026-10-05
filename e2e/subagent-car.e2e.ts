import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

interface Visit {
  key: string
  phase: string
  rider: string
  slot: number
  x: number
  y: number
  h: number
}
const visits = async (page: Page): Promise<Visit[]> => JSON.parse((await page.locator('.stage').getAttribute('data-visits')) ?? '[]')
const seen = async (page: Page, pred: (v: Visit[]) => boolean, timeout = 30_000) => expect.poll(async () => pred(await visits(page)), { timeout }).toBe(true)

async function start(env: Record<string, string>) {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-car-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', ...env }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  // Someone is looking at the window, so the office is drawn at the pace it is meant to be.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await hire(page)
  return { page, shutdown }
}

test('a subagent arrives by car, parks by the door, rushes in, and rushes back to the car which drives off', async () => {
  const { page, shutdown } = await start({ FAKE_DELEGATE: '2', FAKE_DELEGATE_MS: '1800' })
  try {
    // Two cars come, one for each subagent, and nobody is out of a car until it has parked.
    await seen(page, (v) => v.length === 2 && v.every((c) => c.phase === 'driving' && c.rider === 'in the car'), 20_000)
    await page.locator('.stage').screenshot({ path: join(tmpdir(), 'aw-car-driving.png') })

    // They park either side of the door, 104 pixels apart, slanted with their noses to the building.
    await seen(page, (v) => v.length === 2 && v.every((c) => c.phase === 'parked'))
    const parked = await visits(page)
    const [left, right] = [...parked].sort((a, b) => a.x - b.x)
    expect(right!.x - left!.x).toBe(104)
    for (const c of parked) expect(c.h).toBeLessThan(0)
    expect(parked[0]!.y).toBe(parked[1]!.y)

    // The passengers step out and rush in: they move at twice the walking pace until they are at their seats.
    await seen(page, (v) => v.some((c) => c.rider === 'rushing'))
    await page.locator('.stage').screenshot({ path: join(tmpdir(), 'aw-car-rushing.png') })
    await seen(page, (v) => v.every((c) => c.rider === 'inside'))
    await expect(page.locator('.stage')).toHaveAttribute('data-crew', /fake1/)

    // When a subagent is done its passenger rushes back, the car reverses out and speeds away, and the spot is free again.
    await seen(page, (v) => v.some((c) => c.phase === 'departing'))
    await page.locator('.stage').screenshot({ path: join(tmpdir(), 'aw-car-leaving.png') })
    await seen(page, (v) => v.length === 0, 30_000)
  } finally {
    await shutdown()
  }
})

test('a subagent that is done before its car has even parked sends nobody out, and the car still drives off', async () => {
  // Very short jobs: both are done long before a car can reach the pavement.
  const { page, shutdown } = await start({ FAKE_DELEGATE: '1', FAKE_DELEGATE_MS: '100' })
  try {
    await seen(page, (v) => v.length === 1, 20_000)
    await seen(page, (v) => v.length === 0, 30_000)
  } finally {
    await shutdown()
  }
})
