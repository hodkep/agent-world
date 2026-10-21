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
