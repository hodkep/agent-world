import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

interface Seat { key: string; seat: number; x: number; y: number; facing: string; desk: { x: number; y: number }; subagents: number }
const crew = async (page: Page) => JSON.parse((await page.locator('.stage').getAttribute('data-crew')) ?? '[]') as Seat[]

async function office(env: Record<string, string>) {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-subs-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), ...env }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  return { page, shutdown }
}

test('subagents gather around their main agent, facing it, each in a seat of its own', async ({}, info) => {
  const { page, shutdown } = await office({ FAKE_DELAY_MS: '50', FAKE_SUBS: '6', FAKE_SUBS_HOLD: '1' })
  try {
    await expect.poll(async () => (await crew(page)).length, { timeout: 20_000 }).toBe(6)
    const seats = await crew(page)
    expect(new Set(seats.map((s) => `${s.x},${s.y}`)).size).toBe(6)
    for (const s of seats) {
      expect(s.subagents).toBe(6)
      // The main agent sits across the two tiles from the chair tile; the desk is the row above.
      const dx = s.x - s.desk.x
      const dy = s.y - s.desk.y
      if (dy === -2) {
        // Across the desk from them, looking at them.
        expect([0, 1]).toContain(dx)
        expect(s.facing).toBe('down')
      } else {
        // At the sides of the desk, a row above or below the chair so that no two sit on top of each other, turned towards them.
        expect([-1, 1]).toContain(dy)
        expect([-1, 2]).toContain(dx)
        expect(s.facing).toBe(dx < 0 ? 'right' : 'left')
      }
    }
    await info.attach('office', { body: await page.screenshot(), contentType: 'image/png' })
  } finally {
    await shutdown()
  }
})

test('a seventh subagent has no seat at the desk, and the count still says seven', async () => {
  const { page, shutdown } = await office({ FAKE_DELAY_MS: '50', FAKE_SUBS: '7', FAKE_SUBS_HOLD: '1' })
  try {
    await expect.poll(async () => (await crew(page)).length, { timeout: 20_000 }).toBe(6)
    await expect.poll(async () => (await crew(page))[0]?.subagents).toBe(7)
    await page.waitForTimeout(1500)
    expect((await crew(page)).length).toBe(6)
  } finally {
    await shutdown()
  }
})

test('when the subagents finish, the seats empty and the count goes', async () => {
  const { page, shutdown } = await office({ FAKE_DELAY_MS: '1500', FAKE_SUBS: '3' })
  try {
    await expect.poll(async () => (await crew(page)).length, { timeout: 30_000 }).toBe(3)
    await expect.poll(async () => (await crew(page)).length, { timeout: 30_000 }).toBe(0)
  } finally {
    await shutdown()
  }
})
