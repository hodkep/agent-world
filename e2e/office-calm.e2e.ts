import { expect, test } from '@playwright/test'
import { hireNamed, shotApp } from './shotsKit'

// Each test starts its own app and the longest takes minutes: run them side by side on the two workers instead of one after another.
test.describe.configure({ mode: 'parallel' })

type Page = import('@playwright/test').Page
const setItem = (page: Page, k: string, v: string) => page.evaluate(([key, val]) => localStorage.setItem(key!, val!), [k, v])
type Life = { errands: { agent: string; kind: string }[]; boy: { joined: number; noticed: number; caught: number; playing: boolean } }

/** Keeps a record of the errands (most at once, the shortest rest of an agent between two) and the shouts, as the page publishes them. */
const record = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __calm: { most: number; gap: number; shouts: Set<string>; last: Record<string, number>; was: Set<string> } }
    w.__calm = { most: 0, gap: Infinity, shouts: new Set(), last: {}, was: new Set() }
    const stage = document.querySelector('.stage')!
    new MutationObserver(() => {
      const l = JSON.parse(stage.getAttribute('data-life') ?? 'null') as Life | null
      const now = Date.now()
      const away = new Set((l?.errands ?? []).filter((e) => e.kind !== 'drill').map((e) => e.agent))
      w.__calm.most = Math.max(w.__calm.most, away.size)
      for (const a of w.__calm.was) if (!away.has(a)) w.__calm.last[a] = now
      for (const a of away) if (!w.__calm.was.has(a) && w.__calm.last[a] !== undefined) w.__calm.gap = Math.min(w.__calm.gap, now - w.__calm.last[a]!)
      w.__calm.was = away
      for (const x of JSON.parse(stage.getAttribute('data-shouts') ?? '[]') as string[]) w.__calm.shouts.add(x)
    }).observe(stage, { attributes: true, attributeFilter: ['data-life', 'data-shouts'] })
  })
const calm = (page: Page) => page.evaluate(() => { const c = (window as unknown as { __calm: { most: number; gap: number; shouts: Set<string> } }).__calm; return { most: c.most, gap: c.gap, shouts: [...c.shouts] } })
/** The office boy at the board, with the game started: asked for again every 40 s, since the agent it is for may be slow to arrive on a loaded machine and the game then gives up. */
async function boyPlays(page: Page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await setItem(page, 'aw.officeCall', 'boyplay')
    try {
      await expect.poll(async () => (await life(page))?.boy.playing, { timeout: 40_000 }).toBe(true)
      return
    } catch {
      // the game gave up: ask again
    }
  }
  await expect.poll(async () => (await life(page))?.boy.playing, { timeout: 40_000 }).toBe(true)
}
const life = async (page: Page) => JSON.parse((await page.locator('.stage').getAttribute('data-life')) ?? 'null') as Life | null

test('the office is calm: no more than two agents away at once, and an agent that came back sits for a good while before it goes off again', async () => {
  test.setTimeout(420_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle', eli: 'idle', fay: 'idle' } })
  try {
    const { page } = o
    // Ten times faster than real, so a minute's rest is six seconds.
    await setItem(page, 'aw.staffFast', '10')
    await setItem(page, 'aw.clockHour', '11')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'dee', 'eli', 'fay']) await hireNamed(page, name)
    await page.waitForTimeout(90_000)
    const c = await calm(page)
    expect(c.most).toBeLessThanOrEqual(2)
    // At least a minute (six seconds here, less a margin) between one errand of an agent and its next.
    expect(c.gap).toBeGreaterThanOrEqual(5000)
  } finally {
    await o.shutdown()
  }
})

test('the office boy joins an idle agent at the carrom board; the supervisor coming from behind catches him, from the front he sees him and leaves', async () => {
  test.setTimeout(420_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle' } })
  try {
    const { page } = o
    await setItem(page, 'aw.staffFast', '3')
    await setItem(page, 'aw.clockHour', '11')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'dee']) await hireNamed(page, name)
    await page.waitForTimeout(3000)

    // He joins an agent at the board.
    await boyPlays(page)

    // The supervisor comes from the west door, behind him: the can, "Get back to work!", "Ouch!".
    await setItem(page, 'aw.officeCall', 'boss')
    await expect.poll(async () => (await life(page))?.boy.caught, { timeout: 60_000 }).toBe(1)
    await expect.poll(async () => (await calm(page)).shouts, { timeout: 10_000 }).toEqual(expect.arrayContaining(['Get back to work!', 'Ouch!']))
    expect((await life(page))!.boy.playing).toBe(false)
  } finally {
    await o.shutdown()
  }
})

test('an office boy who faces the supervisor sees him, says "Boss!", leaves the game, and the agent says "Hey!"', async () => {
  test.setTimeout(420_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle' } })
  try {
    const { page } = o
    await setItem(page, 'aw.staffFast', '3')
    await setItem(page, 'aw.clockHour', '11')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'dee']) await hireNamed(page, name)
    await page.waitForTimeout(3000)
    // The supervisor does not come to the boy by himself: only the trial brings him, and from the front.
    await setItem(page, 'aw.officeCall', 'quiet')
    await boyPlays(page)
    await setItem(page, 'aw.officeCall', 'bosseast')
    await expect.poll(async () => (await life(page))?.boy.noticed, { timeout: 30_000 }).toBe(1)
    await expect.poll(async () => (await calm(page)).shouts, { timeout: 10_000 }).toEqual(expect.arrayContaining(['Boss!', 'Hey!']))
    expect((await life(page))!.boy.playing).toBe(false)
  } finally {
    await o.shutdown()
  }
})

test('a label with the role shows over the supervisor, the office boy and the cat while the pointer is on them, and not otherwise', async () => {
  test.setTimeout(240_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle' } })
  try {
    const { page } = o
    await setItem(page, 'aw.clockHour', '11')
    await page.reload()
    await page.locator('.stage').waitFor()
    for (const name of ['ada', 'dee']) await hireNamed(page, name)
    const stage = page.locator('.stage')
    const staff = async () => JSON.parse((await stage.getAttribute('data-staff')) ?? 'null') as { staff: { kind: string; x: number; y: number; label: boolean }[] }
    await expect.poll(async () => (await staff())?.staff.length, { timeout: 30_000 }).toBe(2)
    // Where a tile is on the screen: the stage's corner, the view's pan and scale, then the tile's middle.
    const at = async (x: number, y: number) => {
      const box = (await stage.boundingBox())!
      const v = JSON.parse((await stage.getAttribute('data-view'))!) as { scale: number; x: number; y: number }
      return { x: box.x + v.x + (x * 16 + 8) * v.scale, y: box.y + v.y + (y * 16 + 4) * v.scale }
    }
    for (const [kind, name] of [['boy', 'the office boy'], ['supervisor', 'the supervisor']] as const) {
      // Resting, they are standing; follow the figure until the pointer is over it and its label is up.
      await expect
        .poll(async () => {
          const me = (await staff()).staff.find((s) => s.kind === kind)!
          const p = await at(me.x, me.y)
          await page.mouse.move(p.x, p.y)
          return (await staff()).staff.find((s) => s.kind === kind)!.label
        }, { timeout: 30_000, message: name })
        .toBe(true)
      await page.mouse.move(2, 2)
      await expect.poll(async () => (await staff()).staff.find((s) => s.kind === kind)!.label, { timeout: 5000 }).toBe(false)
    }
    const cat = async () => JSON.parse((await stage.getAttribute('data-ambience')) ?? 'null').cat as { x: number; y: number; label: boolean } | null
    await expect
      .poll(async () => {
        const c = (await cat())!
        const p = await at(c.x, c.y)
        await page.mouse.move(p.x, p.y + 4)
        return (await cat())!.label
      }, { timeout: 30_000 })
      .toBe(true)
  } finally {
    await o.shutdown()
  }
})
