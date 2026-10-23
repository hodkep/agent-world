import { expect, test } from '@playwright/test'
import { hireNamed, shotApp } from './shotsKit'

type Staff = { water: number; staff: { kind: 'boy' | 'supervisor'; x: number; y: number; pose: string; said: string; carrying: string }[] }
const SUPERVISOR_LINES = ['Any blockers?', 'ETA?', 'Is it in the sprint?', 'Per my last email']

/** Starts something in the office at once (aw.officeCall): what a spec must see is not left to chance and to a slow runner. */
const call = (page: import('@playwright/test').Page, what: string) => page.evaluate((w) => localStorage.setItem('aw.officeCall', w), what)
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
    await page.locator('.stage').waitFor()
    for (const name of ['ada', 'bo', 'cy']) await hireNamed(page, name)
    // What the staff did is brief at that speed (a line lasts less than a frame), so the page keeps a record of everything said, every pose and everything carried, and publishes it.
    const seen = async () => (JSON.parse((await stage(page).getAttribute('data-staff')) ?? 'null') as { seen: { said: string[]; poses: string[]; carried: string[] } } | null)?.seen ?? { said: [], poses: [], carried: [] }

    // The supervisor stands by a working agent and says one of his lines.
    await call(page, 'sup:visit')
    await expect.poll(async () => (await seen()).said.some((x) => x.startsWith('supervisor: ') && SUPERVISOR_LINES.includes(x.slice(12))), { timeout: 90_000 }).toBe(true)

    // An idle agent is in the office, so the water goes down; the office boy fetches a jar, and the cooler is full again.
    await expect.poll(async () => (await staff(page))!.water, { timeout: 120_000 }).toBeLessThan(0.2)
    await expect.poll(async () => (await staff(page))!.water, { timeout: 120_000 }).toBeGreaterThan(0.9)
    // He brought a new jar, and took the old empty one out.
    await expect.poll(async () => (await seen()).carried, { timeout: 30_000 }).toEqual(expect.arrayContaining(['jar', 'old-jar']))

    // The supervisor gives the office boy an order, and he salutes.
    await call(page, 'sup:order')
    await expect.poll(async () => (await seen()).said.some((x) => /^supervisor: (Refill the cooler|Empty the bin|Wipe the counter|Water the plants|Sweep the floor)!$/.test(x)), { timeout: 180_000 }).toBe(true)
    await expect.poll(async () => (await seen()).poses.includes('boy: salute'), { timeout: 60_000 }).toBe(true)
    await expect.poll(async () => (await seen()).poses.includes('supervisor: point'), { timeout: 60_000 }).toBe(true)
    // His chores: the bin is emptied (a bag taken out) and the counter wiped.
    await call(page, 'boy:bin')
    await expect.poll(async () => (await seen()).carried, { timeout: 90_000 }).toContain('bag')
    await call(page, 'boy:counter')
    await expect.poll(async () => (await seen()).poses, { timeout: 90_000 }).toContain('boy: wipe')

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

test('idle agents fetch water and coffee (which falls with every cup) and play carrom in twos, and a player with work leaves the game; the supervisor reads, drinks, admires a painting and takes calls; the staff are never still', async () => {
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
    const seenLife = () => page.evaluate(() => { const w = window as unknown as { __life: { kinds: Set<string>; players: Set<number>; scored: boolean; poses: Set<string> } }; return { kinds: [...w.__life.kinds], players: [...w.__life.players], scored: w.__life.scored, poses: [...w.__life.poses] } })
    // The poses come from the page's own record of every pose struck, since a pose lasts less than a frame at this speed.
    const seen = async () => ({ ...(await seenLife()), poses: (JSON.parse((await stage(page).getAttribute('data-staff')) ?? 'null') as { seen: { poses: string[] } } | null)?.seen.poses ?? [] })

    // Idle agents fetch a cup of water and of coffee, and sit down to carrom, two of them, striking and scoring.
    await call(page, 'drink:water')
    await expect.poll(async () => (await seen()).kinds, { timeout: 90_000 }).toContain('drink:water')
    await call(page, 'drink:coffee')
    await expect.poll(async () => (await seen()).kinds, { timeout: 90_000 }).toContain('drink:coffee')
    await call(page, 'game')
    await expect.poll(async () => (await seen()).players.length > 0 && (await seen()).scored, { timeout: 200_000 }).toBe(true)
    expect((await seen()).players[0]).toBe(2)

    // The supervisor does more than check on agents: he reads with a book, drinks, looks at a painting and takes a call; the office boy sweeps and carries things.
    for (const [round, pose] of [['read', 'supervisor: hold'], ['read', 'supervisor: reach'], ['coffee', 'supervisor: sip'], ['paint', 'supervisor: chin'], ['call', 'supervisor: call'], ['outside', 'supervisor: clasp']] as const) {
      if (!(await seen()).poses.includes(pose)) await call(page, `sup:${round}`)
      await expect.poll(async () => (await seen()).poses, { timeout: 90_000, message: pose }).toContain(pose)
    }
    await call(page, 'boy:bin')
    await expect.poll(async () => (await seen()).poses, { timeout: 90_000 }).toContain('carry: bag')

    // They rest between jobs and rounds (45 to 90 s, so 2 to 5 s at this speed), but not for longer: sampled every 400 ms, the longest stretch in one place, pose and hands stays under ten seconds.
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
    expect(longest.boy! * 0.4).toBeLessThan(10)
    expect(longest.supervisor! * 0.4).toBeLessThan(10)

    // A player who gets work leaves the game, and the game stops when one is left over.
    await call(page, 'game')
    await expect.poll(async () => (await life(page))?.game?.started ?? false, { timeout: 120_000 }).toBe(true)
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
