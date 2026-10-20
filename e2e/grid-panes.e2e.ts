import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start(width = 1440, height = 900) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gp-')))
  const dir = join(tmp, 'shop-front')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  const page = await run.app.firstWindow()
  await run.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setSize(w!, h!), [width, height])
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  return { ...run, page, dir }
}

const bar = (page: Page) => page.getByRole('toolbar', { name: 'Grid layout' })
const pane = (page: Page, name: string) => page.locator(`.pane[aria-label="${name}'s conversation"]`)
const terminal = (page: Page, dir: string) => page.locator(`.pane[aria-label="Terminal in ${basename(dir)}"]`)
const side = (page: Page) => page.getByRole('complementary', { name: 'Agents and terminals to add' })

/** A tile's place in the grid area as shares of it (0 to 1), margins ignored. */
async function share(page: Page, tile: ReturnType<typeof pane>) {
  const area = (await page.locator('.panes').boundingBox())!
  const b = (await tile.boundingBox())!
  const r = (n: number) => Math.round(n * 100) / 100
  return { x: r((b.x - area.x) / area.width), y: r((b.y - area.y) / area.height), w: r(b.width / area.width), h: r(b.height / area.height) }
}

async function openGrid(page: Page, names: string[]) {
  for (const n of names) await hire(page, { name: n })
  if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
  await page.getByRole('button', { name: 'Grid', exact: true }).click()
  await bar(page).getByRole('button', { name: 'Conversations' }).click()
  for (const n of names) await side(page).getByRole('button', { name: new RegExp(`^${n}`) }).click()
}

test('the grid toolbar stays inside its area, clear of the side panel', async () => {
  const { page, shutdown } = await start(1200, 700)
  try {
    await openGrid(page, ['ada', 'linus'])
    // Bring the panel back beside the grid, wide, which leaves the grid little room: the case that used to overlap.
    await page.getByRole('button', { name: 'Show panel' }).click()
    await page.getByRole('button', { name: 'Expand' }).click()
    const area = (await page.locator('.stage-wrap').boundingBox())!
    const aside = (await page.locator('aside').boundingBox())!
    for (const b of await bar(page).getByRole('button').all()) {
      const box = (await b.boundingBox())!
      expect(box.x + box.width, await b.innerText()).toBeLessThanOrEqual(area.x + area.width + 0.5)
    }
    expect(area.x + area.width).toBeLessThanOrEqual(aside.x + 0.5)
  } finally {
    await shutdown()
  }
})

test('the grid shows its conversations and leaves the side panel closed until asked', async () => {
  const { page, shutdown } = await start()
  try {
    await openGrid(page, ['ada', 'linus'])
    await expect(page.locator('.pane')).toHaveCount(2)
    // Exactly the two grid chats are open; the main chat is not a third.
    await expect(page.locator('.chat:visible')).toHaveCount(2)
    await expect(page.locator('aside')).toBeHidden()
    await page.getByRole('button', { name: 'Open ada in the side panel' }).click()
    await expect(page.locator('aside')).toBeVisible()
    await page.getByRole('button', { name: 'Hide panel' }).click()
    await expect(page.locator('aside')).toBeHidden()
    await bar(page).getByRole('button', { name: 'Overview' }).click()
    await expect(page.locator('aside')).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('tiles can be dragged to any edge of any other, and swapped', async () => {
  const { page, shutdown } = await start()
  try {
    await openGrid(page, ['ada', 'linus', 'grace'])
    await expect(page.locator('.pane')).toHaveCount(3)
    // Put linus beneath ada: ada's column now holds both, and grace keeps her side whole.
    const ada = pane(page, 'ada')
    const box = (await ada.boundingBox())!
    await pane(page, 'linus').locator('.pane-head').dragTo(ada, { targetPosition: { x: box.width / 2, y: box.height - 10 } })
    const a = await share(page, ada)
    const l = await share(page, pane(page, 'linus'))
    expect(l.y).toBeGreaterThan(a.y)
    expect(l.x).toBeCloseTo(a.x, 1)
    // Dropping on the middle swaps the two.
    const before = await share(page, pane(page, 'grace'))
    const now = (await ada.boundingBox())!
    await pane(page, 'grace').locator('.pane-head').dragTo(ada, { targetPosition: { x: now.width / 2, y: now.height / 2 } })
    const after = await share(page, pane(page, 'ada'))
    expect(after).toEqual(before)
  } finally {
    await shutdown()
  }
})

test('the gap between two tiles resizes both of them', async () => {
  const { page, shutdown } = await start()
  try {
    await openGrid(page, ['ada', 'linus'])
    const sides = async () => {
      const a = await share(page, pane(page, 'ada'))
      const l = await share(page, pane(page, 'linus'))
      return a.x < l.x ? { left: a, right: l, leftName: 'ada' } : { left: l, right: a, leftName: 'linus' }
    }
    const before = await sides()
    expect(before.left.w).toBeCloseTo(before.right.w, 1)
    const gutter = page.getByRole('separator', { name: 'Resize the tiles on either side' })
    await expect(gutter).toHaveCount(1)
    const g = (await gutter.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2 - 250, g.y + g.height / 2, { steps: 8 })
    await page.mouse.up()
    const after = await sides()
    // The left one got narrower and the right one wider by the same amount, and the layout is remembered.
    expect(after.left.w).toBeLessThan(before.left.w - 0.1)
    expect(after.right.w).toBeGreaterThan(before.right.w + 0.1)
    expect(after.left.w + after.right.w).toBeCloseTo(before.left.w + before.right.w, 1)
    await page.reload()
    expect((await sides()).left.w).toBeCloseTo(after.left.w, 1)
  } finally {
    await shutdown()
  }
})

test('a terminal sits in the project folder, along the bottom, and can be dragged to a corner', async () => {
  const { page, dir, shutdown } = await start()
  try {
    await openGrid(page, ['ada', 'linus'])
    await bar(page).getByRole('button', { name: '+ Terminal' }).click()
    const term = terminal(page, dir)
    await expect(term).toBeVisible()
    // Along the whole bottom, under the two agents.
    const strip = await share(page, term)
    expect(strip.x).toBe(0)
    expect(strip.w).toBeGreaterThan(0.95)
    expect(strip.y).toBeGreaterThan(0.5)
    await term.locator('.xterm').click()
    await page.keyboard.type('pwd\n')
    await expect(term.locator('.xterm-rows')).toContainText(basename(dir), { timeout: 15_000 })
    // It is not an agent.
    expect(await page.evaluate(() => window.aw.listAgents().then((a) => a.length))).toBe(2)

    // Drag it onto the bottom edge of the left agent: it becomes the bottom-left quarter, and the other agent keeps its half.
    const ada = await share(page, pane(page, 'ada'))
    const linus = await share(page, pane(page, 'linus'))
    const [left, right] = ada.x < linus.x ? [pane(page, 'ada'), pane(page, 'linus')] : [pane(page, 'linus'), pane(page, 'ada')]
    const lb = (await left.boundingBox())!
    await term.locator('.pane-head').dragTo(left, { targetPosition: { x: lb.width / 2, y: lb.height - 10 } })
    const t = await share(page, term)
    expect(t.x).toBeLessThan(0.05)
    expect(t.y).toBeGreaterThan(0.45)
    expect(t.w).toBeCloseTo(0.5, 1)
    expect(t.h).toBeCloseTo(0.5, 1)
    // The other agent takes the whole right half, top to bottom.
    const r = await share(page, right)
    expect(r.x).toBeCloseTo(0.5, 1)
    expect(r.h).toBeGreaterThan(0.95)

    // Closing it ends the shell.
    await term.getByRole('button', { name: /Close the terminal/ }).click()
    await expect(term).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.aw.listShells().then((s) => s.length))).toBe(0)
  } finally {
    await shutdown()
  }
})

test('a terminal can be dragged in from the list, and terminals of an earlier run are cleared', async () => {
  const { page, shutdown } = await start()
  try {
    await hire(page, { name: 'ada' })
    await page.evaluate(() => localStorage.setItem('aw.grid', '1'))
    await page.evaluate(() => localStorage.setItem('aw.gridLayout', JSON.stringify({ root: { kind: 'split', dir: 'row', at: 0.5, a: { kind: 'leaf', tile: 'term:left-over-from-before' }, b: { kind: 'leaf', tile: 'term:another-one' } } })))
    await page.reload()
    // The saved terminals no longer exist, so the grid is empty again.
    await expect(page.locator('.pane')).toHaveCount(0)
    await side(page).getByRole('button', { name: /^Terminal/ }).dragTo(page.locator('.panes'))
    await expect(page.locator('.pane .xterm')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})

test('clicking an agent\'s name in the grid stacks its profile card over its pane: the other panes stay, another name moves it, Escape or a click elsewhere puts it away', async () => {
  const { page, shutdown } = await start(1440, 900)
  try {
    await openGrid(page, ['ada', 'linus'])
    const area = (await page.locator('.panes').boundingBox())!
    const cardOf = (n: string) => page.getByRole('dialog', { name: `${n}'s profile` })
    await expect(page.getByRole('dialog', { name: /profile/ })).toHaveCount(0)

    // The card opens under ada's name, inside the grid, and is the topmost thing there.
    await pane(page, 'ada').getByRole('button', { name: 'ada', exact: true }).click()
    await expect(cardOf('ada')).toBeVisible()
    await expect(cardOf('ada')).toContainText(/settings/i)
    const c = (await cardOf('ada').boundingBox())!
    const p = (await pane(page, 'ada').boundingBox())!
    expect(c.x).toBeGreaterThanOrEqual(p.x - 1)
    expect(c.x + c.width).toBeLessThanOrEqual(area.x + area.width + 1)
    expect(c.y).toBeGreaterThan(p.y)
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.pane-card') !== null, [c.x + c.width / 2, c.y + 40])
    expect(top).toBe(true)
    // The other pane is still there, live.
    await expect(pane(page, 'linus')).toBeVisible()

    // Another name moves the card to that agent's pane.
    await pane(page, 'linus').getByRole('button', { name: 'linus', exact: true }).click()
    await expect(cardOf('linus')).toBeVisible()
    await expect(cardOf('ada')).toHaveCount(0)

    // Escape puts it away, and so does a click anywhere else; the name toggles it too.
    await page.keyboard.press('Escape')
    await expect(cardOf('linus')).toHaveCount(0)
    await pane(page, 'ada').getByRole('button', { name: 'ada', exact: true }).click()
    await expect(cardOf('ada')).toBeVisible()
    await pane(page, 'linus').locator('.pane-head').click({ position: { x: 300, y: 10 } })
    await expect(cardOf('ada')).toHaveCount(0)
    await pane(page, 'ada').getByRole('button', { name: 'ada', exact: true }).click()
    await pane(page, 'ada').getByRole('button', { name: 'ada', exact: true }).click()
    await expect(cardOf('ada')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
