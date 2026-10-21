import { expect, test } from '@playwright/test'
import { hireNamed, shotApp } from './shotsKit'

type Staff = { water: number; staff: { kind: 'boy' | 'supervisor'; x: number; y: number; pose: string; said: string; carrying: string }[] }
const SUPERVISOR_LINES = ['Any blockers?', 'ETA?', 'Is it in the sprint?', 'Per my last email']

const stage = (page: import('@playwright/test').Page) => page.locator('.stage')
const staff = async (page: import('@playwright/test').Page): Promise<Staff | null> => {
  const raw = await stage(page).getAttribute('data-staff')
  return raw ? (JSON.parse(raw) as Staff) : null
}

test('with agents in the office the supervisor goes to one that is working and says a line, the office boy salutes when told, the cooler\'s water goes down with idle agents and is refilled, and Office life off puts them away', async () => {
  test.setTimeout(540_000)
  const o = await shotApp({ scenes: { ada: 'idle', bo: 'thinking', cy: 'implementing' } })
  try {
    const { page } = o
    // The staff's waits and the water run 20 times faster, so a spec need not sit through minutes.
    await page.evaluate(() => localStorage.setItem('aw.staffFast', '20'))
    await page.reload()
    // What the staff do is brief at that speed: keep a record of what they said and which poses they struck, as the page publishes it.
    await page.locator('.stage').waitFor()
    await page.evaluate(() => {
      const w = window as unknown as { __seen: { said: Set<string>; poses: Set<string>; carried: Set<string> } }
      w.__seen = { said: new Set(), poses: new Set(), carried: new Set() }
      const stage = document.querySelector('.stage')!
      new MutationObserver(() => {
        const s = JSON.parse(stage.getAttribute('data-staff') ?? 'null') as { staff: { kind: string; pose: string; said: string; carrying: string }[] } | null
        for (const x of s?.staff ?? []) (x.said && w.__seen.said.add(`${x.kind}: ${x.said}`), w.__seen.poses.add(`${x.kind}: ${x.pose}`), x.carrying && w.__seen.carried.add(x.carrying))
      }).observe(stage, { attributes: true, attributeFilter: ['data-staff'] })
    })
    for (const name of ['ada', 'bo', 'cy']) await hireNamed(page, name)
    const seen = () => page.evaluate(() => { const w = window as unknown as { __seen: { said: Set<string>; poses: Set<string>; carried: Set<string> } }; return { said: [...w.__seen.said], poses: [...w.__seen.poses], carried: [...w.__seen.carried] } })

    // The supervisor stands by a working agent and says one of his lines.
    await expect.poll(async () => (await seen()).said.some((x) => x.startsWith('supervisor: ') && SUPERVISOR_LINES.includes(x.slice(12))), { timeout: 90_000 }).toBe(true)

    // An idle agent is in the office, so the water goes down; the office boy fetches a jar, and the cooler is full again.
    await expect.poll(async () => (await staff(page))!.water, { timeout: 120_000 }).toBeLessThan(0.2)
    await expect.poll(async () => (await staff(page))!.water, { timeout: 120_000 }).toBeGreaterThan(0.9)
    // He brought a new jar, and took the old empty one out.
    await expect.poll(async () => (await seen()).carried, { timeout: 30_000 }).toEqual(expect.arrayContaining(['jar', 'old-jar']))

    // The supervisor gives the office boy an order, and he salutes.
    await expect.poll(async () => (await seen()).said.some((x) => /^supervisor: (Refill the cooler|Empty the bin|Wipe the counter)!$/.test(x)), { timeout: 180_000 }).toBe(true)
    await expect.poll(async () => (await seen()).poses.includes('boy: salute'), { timeout: 60_000 }).toBe(true)
    await expect.poll(async () => (await seen()).poses.includes('supervisor: point'), { timeout: 60_000 }).toBe(true)
    // His chores: the bin is emptied (a bag taken out) and the counter wiped, sooner or later.
    await expect.poll(async () => { const x = await seen(); return x.carried.includes('bag') && x.poses.includes('boy: wipe') }, { timeout: 240_000 }).toBe(true)

    // Office life off: the staff are put away.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    const life = settings.getByLabel(/^Office life/)
    await expect(life).toBeChecked()
    await life.uncheck()
    await expect.poll(async () => (await staff(page))!.staff.length, { timeout: 10_000 }).toBe(0)
  } finally {
    await o.shutdown()
  }
})

type Life = { errands: { agent: string; kind: string; what: string; phase: string }[]; game: { players: string[]; started: boolean; strikes: number; scores: number[]; over: boolean } | null; cheers: number; coffee: number }
const life = async (page: import('@playwright/test').Page): Promise<Life | null> => {
  const raw = await page.locator('.stage').getAttribute('data-life')
  return raw ? (JSON.parse(raw) as Life) : null
}
const send = (app: import('@playwright/test').ElectronApplication, agentId: string, activity: string) =>
  app.evaluate(({ BrowserWindow }, [id, a]) => BrowserWindow.getAllWindows()[0]!.webContents.send('agent-event', { type: 'activity', agentId: id, sessionId: 's1', activity: a }), [agentId, activity])

test('idle agents fetch water and coffee (which falls with every cup) and play carrom in twos or fours, and a player with work leaves the game; the supervisor reads, drinks, admires a painting and takes calls; the staff are never still', async () => {
  test.setTimeout(540_000)
  const o = await shotApp({ scenes: { ada: 'idle', dee: 'idle', eli: 'idle', fay: 'idle', bo: 'thinking', cy: 'implementing' } })
  try {
    const { page, app } = o
    await page.evaluate(() => localStorage.setItem('aw.staffFast', '20'))
    await page.reload()
    await page.locator('.stage').waitFor()
    await page.evaluate(() => {
      const w = window as unknown as { __life: { kinds: Set<string>; players: Set<number>; scored: boolean; poses: Set<string> } }
      w.__life = { kinds: new Set(), players: new Set(), scored: false, poses: new Set() }
      const stage = document.querySelector('.stage')!
      new MutationObserver(() => {
        const l = JSON.parse(stage.getAttribute('data-life') ?? 'null') as { errands: { kind: string; what: string }[]; game: { players: string[]; strikes: number; scores: number[] } | null } | null
        for (const e of l?.errands ?? []) w.__life.kinds.add(`${e.kind}:${e.what}`)
        if (l?.game && l.game.strikes > 0) (w.__life.players.add(l.game.players.length), l.game.scores.some((s) => s > 0) && (w.__life.scored = true))
        const s = JSON.parse(stage.getAttribute('data-staff') ?? 'null') as { staff: { kind: string; pose: string; carrying: string }[] } | null
        for (const x of s?.staff ?? []) (w.__life.poses.add(`${x.kind}: ${x.pose}`), x.carrying && w.__life.poses.add(`carry: ${x.carrying}`))
      }).observe(stage, { attributes: true, attributeFilter: ['data-life', 'data-staff'] })
    })
    for (const name of ['ada', 'dee', 'eli', 'fay', 'bo', 'cy']) await hireNamed(page, name)
    const seen = () => page.evaluate(() => { const w = window as unknown as { __life: { kinds: Set<string>; players: Set<number>; scored: boolean; poses: Set<string> } }; return { kinds: [...w.__life.kinds], players: [...w.__life.players], scored: w.__life.scored, poses: [...w.__life.poses] } })

    // Idle agents fetch a cup of water and of coffee, and sit down to carrom, two or four of them, striking and scoring.
    await expect.poll(async () => (await seen()).kinds, { timeout: 150_000 }).toEqual(expect.arrayContaining(['drink:water', 'drink:coffee']))
    await expect.poll(async () => (await seen()).players.length > 0 && (await seen()).scored, { timeout: 200_000 }).toBe(true)
    expect([2, 4]).toContain((await seen()).players[0])

    // The supervisor does more than check on agents: he reads with a book, drinks, looks at a painting and takes a call; the office boy sweeps and carries things.
    await expect.poll(async () => (await seen()).poses, { timeout: 240_000 }).toEqual(expect.arrayContaining(['supervisor: hold', 'supervisor: reach', 'supervisor: sip', 'supervisor: chin', 'supervisor: call', 'supervisor: clasp']))
    await expect.poll(async () => (await seen()).poses.some((p) => p === 'carry: tray' || p === 'carry: parcel' || p === 'carry: bag'), { timeout: 240_000 }).toBe(true)

    // Neither of them stands still for long: sampled every 400 ms, the longest stretch in one place, pose and hands is a few seconds at most.
    const longest: Record<string, number> = { boy: 0, supervisor: 0 }
    const was: Record<string, string> = {}
    const run: Record<string, number> = { boy: 0, supervisor: 0 }
    for (let i = 0; i < 60; i++) {
      for (const x of (await staff(page))!.staff) {
        const now = `${x.x},${x.y},${x.pose},${x.carrying}`
        run[x.kind] = was[x.kind] === now ? run[x.kind]! + 1 : 0
        was[x.kind] = now
        longest[x.kind] = Math.max(longest[x.kind]!, run[x.kind]!)
      }
      await page.waitForTimeout(400)
    }
    expect(longest.boy! * 0.4).toBeLessThan(6)
    expect(longest.supervisor! * 0.4).toBeLessThan(6)

    // A player who gets work leaves the game, and the game stops when one is left over.
    await expect.poll(async () => (await life(page))?.game?.started ?? false, { timeout: 240_000 }).toBe(true)
    const game = (await life(page))!.game!
    const agents = await page.evaluate(() => window.aw.listAgents())
    const player = agents.find((a) => game.players.includes(a.id))!
    await send(app, player.id, 'implementing')
    await expect.poll(async () => (await life(page))?.game ?? null, { timeout: 15_000 }).toBeNull()
    await expect.poll(async () => ((await life(page))?.errands ?? []).some((e) => e.agent === player.id), { timeout: 15_000 }).toBe(false)
  } finally {
    await o.shutdown()
  }
})

test('an agent that has worked for ten seconds and finishes cheers, with a shout and confetti, and the agent next to it claps', async () => {
  test.setTimeout(120_000)
  const o = await shotApp({ scenes: { ada: 'idle', bo: 'idle' } })
  try {
    const { page, app } = o
    await page.locator('.stage').waitFor()
    await page.evaluate(() => {
      const w = window as unknown as { __shouts: string[] }
      w.__shouts = []
      const stage = document.querySelector('.stage')!
      new MutationObserver(() => w.__shouts.push(stage.getAttribute('data-shouts') ?? '')).observe(stage, { attributes: true, attributeFilter: ['data-shouts'] })
    })
    for (const name of ['ada', 'bo']) await hireNamed(page, name)
    const [ada] = (await page.evaluate(() => window.aw.listAgents())).filter((a) => a.name === 'ada')
    await send(app, ada!.id, 'implementing')
    await page.waitForTimeout(9500)
    await send(app, ada!.id, 'idle')
    await expect.poll(async () => (await life(page))?.cheers ?? 0, { timeout: 10_000 }).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shouts: string[] }).__shouts.some((s) => s.includes('DONE!'))), { timeout: 10_000 }).toBe(true)
  } finally {
    await o.shutdown()
  }
})
