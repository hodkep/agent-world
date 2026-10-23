import { expect, test } from '@playwright/test'
import { hireNamed, shotApp } from './shotsKit'

type Page = import('@playwright/test').Page
type Amb = { hour: number; ritual: string; event: string; phase: string; weather: string; ledge: boolean; flying: boolean; tint: number; cat: { state: string; x: number; y: number } | null; guard: boolean; callers: string[]; outside: { add: number; dim: number; lamps: boolean; rain: boolean }; lights: number; banner: string; trips: { kind: string; mode: string; x: number; y: number }[] }
const ambience = async (page: Page): Promise<Amb | null> => {
  const raw = await page.locator('.stage').getAttribute('data-ambience')
  return raw ? (JSON.parse(raw) as Amb) : null
}
const send = (app: import('@playwright/test').ElectronApplication, agentId: string, activity: string) =>
  app.evaluate(({ BrowserWindow }, [id, a]) => BrowserWindow.getAllWindows()[0]!.webContents.send('agent-event', { type: 'activity', agentId: id, sessionId: 's1', activity: a }), [agentId, activity])
const setItem = (page: Page, k: string, v: string) => page.evaluate(([key, val]) => localStorage.setItem(key!, val!), [k, v])

/** Keeps a record of what the page published, since many of these moments are brief: the events, cat states, callers, errand kinds, the largest tint and what agents did. */
const record = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __seen: { events: Set<string>; cat: Set<string>; callers: Set<string>; trips: Set<string>; errands: Set<string>; doing: Set<string>; carried: Set<string>; shouts: Set<string>; tint: number; ledge: boolean; weather: Set<string>; banners: Set<string> } }
    w.__seen = { events: new Set(), cat: new Set(), callers: new Set(), trips: new Set(), errands: new Set(), doing: new Set(), carried: new Set(), shouts: new Set(), tint: 0, ledge: false, weather: new Set(), banners: new Set() }
    const stage = document.querySelector('.stage')!
    const read = (name: string) => JSON.parse(stage.getAttribute(name) ?? 'null')
    new MutationObserver(() => {
      const a = read('data-ambience')
      if (a) {
        if (a.event) w.__seen.events.add(a.event)
        if (a.cat) w.__seen.cat.add(a.cat.state)
        for (const c of a.callers) w.__seen.callers.add(c)
        for (const t of a.trips) w.__seen.trips.add(`${t.kind}:${t.mode}`)
        w.__seen.tint = Math.max(w.__seen.tint, a.tint)
        w.__seen.ledge ||= a.ledge
        w.__seen.weather.add(a.weather)
        if (a.banner) w.__seen.banners.add(a.banner)
      }
      const l = read('data-life')
      for (const e of l?.errands ?? []) w.__seen.errands.add(e.kind)
      for (const d of l?.doing ?? []) w.__seen.doing.add(d.doing)
      const s = read('data-staff')
      for (const x of s?.staff ?? []) x.carrying && w.__seen.carried.add(x.carrying)
      for (const x of read('data-shouts') ?? []) w.__seen.shouts.add(x)
    }).observe(stage, { attributes: true, attributeFilter: ['data-ambience', 'data-life', 'data-staff', 'data-shouts'] })
  })
const seen = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __seen: Record<string, unknown> }).__seen as { events: Set<string>; cat: Set<string>; callers: Set<string>; trips: Set<string>; errands: Set<string>; doing: Set<string>; carried: Set<string>; shouts: Set<string>; tint: number; ledge: boolean; weather: Set<string>; banners: Set<string> }
    return { events: [...s.events], cat: [...s.cat], callers: [...s.callers], trips: [...s.trips], errands: [...s.errands], doing: [...s.doing], carried: [...s.carried], shouts: [...s.shouts], tint: s.tint, ledge: s.ledge, weather: [...s.weather], banners: [...s.banners] }
  })

test('the room light and the windows follow the hour, idle agents lunch at one and have chai at four, the office boy only cleans at night and the guard stands at the door in the evening', async () => {
  test.setTimeout(240_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle', eli: 'idle' } })
  try {
    const { page } = o
    await setItem(page, 'aw.staffFast', '20')
    await setItem(page, 'aw.clockHour', '12')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'dee', 'eli']) await hireNamed(page, name)
    await expect.poll(async () => (await ambience(page))?.phase, { timeout: 15_000 }).toBe('day')
    expect((await ambience(page))!.guard).toBe(false)
    expect((await ambience(page))!.lights).toBe(0)
    // By day the grounds are lit and the lamps are off.
    await expect.poll(async () => (await ambience(page))?.outside.add ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.5)
    expect((await ambience(page))!.outside.lamps).toBe(false)

    await setItem(page, 'aw.clockHour', '21')
    await expect.poll(async () => (await ambience(page))?.phase, { timeout: 15_000 }).toBe('night')
    await expect.poll(async () => (await ambience(page))?.tint ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.25)
    await expect.poll(async () => (await ambience(page))?.guard, { timeout: 15_000 }).toBe(true)
    // At night the lights over the desks shine; by day they did not.
    await expect.poll(async () => (await ambience(page))?.lights ?? 0, { timeout: 15_000 }).toBeGreaterThan(0.9)
    // At night the lamps are lit and the added daylight has gone.
    await expect.poll(async () => (await ambience(page))?.outside.lamps, { timeout: 15_000 }).toBe(true)
    await expect.poll(async () => (await ambience(page))?.outside.add, { timeout: 15_000 }).toBe(0)

    await setItem(page, 'aw.clockHour', '13')
    await expect.poll(async () => (await ambience(page))?.ritual, { timeout: 15_000 }).toBe('lunch')
    await expect.poll(async () => (await seen(page)).errands, { timeout: 90_000 }).toContain('eat')

    await setItem(page, 'aw.clockHour', '16:10')
    await expect.poll(async () => (await ambience(page))?.ritual, { timeout: 15_000 }).toBe('chai')
    await expect.poll(async () => (await seen(page)).carried, { timeout: 120_000 }).toContain('tray')

    await setItem(page, 'aw.clockHour', '23')
    await expect.poll(async () => (await ambience(page))?.ritual, { timeout: 15_000 }).toBe('night')
  } finally {
    await o.shutdown()
  }
})

test('the cat naps, sits and walks; idle agents huddle at the whiteboard and doze off; a long turn ends in a stretch', async () => {
  test.setTimeout(300_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle', eli: 'idle', fay: 'idle' } })
  try {
    const { page, app } = o
    await setItem(page, 'aw.staffFast', '20')
    await setItem(page, 'aw.clockHour', '11')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'dee', 'eli', 'fay']) await hireNamed(page, name)
    await expect.poll(async () => (await seen(page)).cat, { timeout: 120_000 }).toEqual(expect.arrayContaining(['nap', 'walk', 'sit']))
    // Two idle agents are sent to the whiteboard: a game of the agents' own would take their two places for a long while.
    await setItem(page, 'aw.officeCall', 'huddle')
    await expect.poll(async () => (await seen(page)).errands, { timeout: 90_000 }).toContain('huddle')
    await expect.poll(async () => (await seen(page)).doing, { timeout: 120_000 }).toContain('nap')

    // A turn that runs for ten (sped-up) minutes ends: the agent stretches.
    const ada = (await page.evaluate(() => window.aw.listAgents())).find((a) => a.name === 'ada')!
    await send(app, ada.id, 'implementing')
    await page.waitForTimeout(31_000)
    await send(app, ada.id, 'idle')
    await expect.poll(async () => (await seen(page)).doing, { timeout: 40_000 }).toContain('stretch')
  } finally {
    await o.shutdown()
  }
})

test('a power cut darkens the office and ends, a fire drill takes everyone out, even one at work, and brings them back, a pigeon flies across, a courier and a pizza delivery come to the door, and Office life off puts the cat away', async () => {
  test.setTimeout(300_000)
  const o = await shotApp({ scenes: { ada: 'idle', bo: 'thinking', cy: 'idle' } })
  try {
    const { page } = o
    await setItem(page, 'aw.clockHour', '12')
    await page.reload()
    await page.locator('.stage').waitFor()
    await record(page)
    for (const name of ['ada', 'bo', 'cy']) await hireNamed(page, name)
    await expect.poll(async () => (await ambience(page))?.cat?.state, { timeout: 30_000 }).toBeTruthy()

    await setItem(page, 'aw.officeCall', 'cut')
    await expect.poll(async () => (await seen(page)).events, { timeout: 20_000 }).toContain('cut')
    await expect.poll(async () => (await seen(page)).tint, { timeout: 20_000 }).toBeGreaterThan(0.5)
    await expect.poll(async () => (await seen(page)).banners, { timeout: 10_000 }).toContain('POWER CUT')
    await expect.poll(async () => (await ambience(page))?.event, { timeout: 40_000 }).toBe('')

    await setItem(page, 'aw.officeCall', 'drill')
    await expect.poll(async () => (await seen(page)).events, { timeout: 20_000 }).toContain('drill')
    await expect.poll(async () => (await seen(page)).errands, { timeout: 20_000 }).toContain('drill')
    await expect.poll(async () => (await seen(page)).shouts, { timeout: 20_000 }).toContain('FIRE DRILL!')
    await expect.poll(async () => (await seen(page)).banners, { timeout: 10_000 }).toContain('FIRE DRILL')
    await expect.poll(async () => (await ambience(page))?.event, { timeout: 60_000 }).toBe('')

    await setItem(page, 'aw.officeCall', 'pigeon')
    await expect.poll(async () => (await ambience(page))?.event, { timeout: 20_000 }).toBe('pigeon')
    await expect.poll(async () => (await ambience(page))?.event, { timeout: 30_000 }).toBe('')

    await setItem(page, 'aw.officeCall', 'courier')
    await expect.poll(async () => (await seen(page)).callers, { timeout: 20_000 }).toContain('courier')
    // It comes by scooter along the road, parks, and walks up to the door before it is inside.
    await expect.poll(async () => (await seen(page)).trips, { timeout: 40_000 }).toEqual(expect.arrayContaining(['courier:ride', 'courier:park', 'courier:walk', 'courier:inside', 'courier:leave']))
    await setItem(page, 'aw.officeCall', 'pizza')
    await expect.poll(async () => (await seen(page)).callers, { timeout: 20_000 }).toContain('pizza')
    await expect.poll(async () => (await ambience(page))?.callers, { timeout: 90_000 }).toEqual([])

    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByLabel(/^Office life/).uncheck()
    await expect.poll(async () => (await ambience(page))?.cat, { timeout: 10_000 }).toBeNull()
  } finally {
    await o.shutdown()
  }
})
