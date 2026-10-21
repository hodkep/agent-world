import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'
import { SLOW } from './waits'
import { shot } from './wf-helpers'

// Resting on the project button (or the agent number) opens a grid panel; one click on a tile switches; a click on the button keeps it open until a click elsewhere.
async function office(names: string[], missing?: string, env: Record<string, string> = {}, prefs?: object) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-quick-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const paths = names.map((n) => join(tmp, n))
  for (const p of paths) if (!p.endsWith(missing ?? '\0')) (mkdirSync(p), execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: p }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: paths[0], recent: paths }))
  if (prefs) writeFileSync(join(home, 'preferences.json'), JSON.stringify(prefs))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', ...env }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), paths[0]!)
  await page.reload()
  return { page, shutdown, home }
}

test('the project switcher opens on hover, switches in one click, closes when the pointer leaves, and a click keeps it open until a click elsewhere', async () => {
  const names = Array.from({ length: 11 }, (_, i) => `proj-${String(i).padStart(2, '0')}`)
  const { page, shutdown } = await office(names, 'proj-09')
  try {
    const button = page.locator('.ws-button')
    await expect(button).toContainText('proj-00')
    const panel = page.getByRole('menu', { name: 'Projects' })
    // Resting on the button opens the panel; the project that is open is marked.
    await button.hover()
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /proj-/ })).toHaveCount(11)
    await expect(panel.locator('.wt.on')).toContainText('proj-00')
    await expect(panel.locator('.identicon')).toHaveCount(11)
    await page.waitForTimeout(300)
    await shot(page, 'quick-1-projects')
    // A project whose folder is gone is shown dimmed and cannot be picked.
    await expect(panel.getByRole('menuitem', { name: /proj-09/ })).toBeDisabled()
    // More than eight: a search box, and Enter opens the first match.
    const find = panel.getByRole('textbox', { name: /Find in projects/ })
    await find.fill('proj-03')
    await expect(panel.getByRole('menuitem', { name: /proj-/ })).toHaveCount(1)
    await find.fill('')
    // Leaving closes it (after a moment).
    await page.mouse.move(700, 600)
    await expect(panel).toBeHidden()
    // A click keeps it open when the pointer leaves, until a click elsewhere.
    await button.click()
    await page.mouse.move(700, 600)
    await page.waitForTimeout(700)
    await expect(panel).toBeVisible()
    await page.mouse.click(700, 600)
    await expect(panel).toBeHidden()
    // One click on a tile switches and closes.
    await button.hover()
    await panel.getByRole('menuitem', { name: /proj-02/ }).click()
    await expect(button).toContainText('proj-02')
    await expect(panel).toBeHidden()
  } finally {
    await shutdown()
  }
})

test('the project panel scrolls when its tiles do not fit, keeping its footer, and works from the keyboard', async () => {
  const names = Array.from({ length: 12 }, (_, i) => `proj-${String(i).padStart(2, '0')}`)
  const { page, shutdown } = await office(names)
  try {
    await page.setViewportSize({ width: 1200, height: 520 })
    const button = page.locator('.ws-button')
    await button.click()
    const panel = page.getByRole('menu', { name: 'Projects' })
    const grid = panel.locator('.qg')
    // Taller than the panel lets it be: the grid scrolls inside it and the footer stays in view.
    expect(await grid.evaluate((g) => g.scrollHeight > g.clientHeight)).toBe(true)
    await expect(panel.getByRole('menuitem', { name: 'Open another folder…' })).toBeInViewport()
    await page.waitForTimeout(300)
    await shot(page, 'quick-2-scroll')
    await grid.evaluate((g) => g.scrollTo(0, g.scrollHeight))
    await expect(panel.getByRole('menuitem', { name: /proj-11/ })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    // Keyboard: Down on the button opens it and lands on the first tile, arrows move, a number picks, Esc closes.
    await button.focus()
    await page.keyboard.press('ArrowDown')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /proj-00/ })).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(panel.getByRole('menuitem', { name: /proj-01/ })).toBeFocused()
    await page.keyboard.press('3')
    await expect(button).toContainText('proj-02')
  } finally {
    await shutdown()
  }
})

test('the agent switcher is the same panel: resting on the number opens a grid of agents, one click selects one', async () => {
  const { page, shutdown } = await office(['shop'])
  try {
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'bo' })
    await page.getByRole('tab', { name: 'Chat' }).click()
    const button = page.locator('.hc-switch')
    await button.hover()
    const panel = page.getByRole('menu', { name: 'Agents' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('menuitem', { name: /ada|bo/ })).toHaveCount(2)
    await expect(panel.locator('.identicon')).toHaveCount(2)
    await page.waitForTimeout(300)
    await shot(page, 'quick-3-agents')
    await panel.getByRole('menuitem', { name: /ada/ }).click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    await expect(panel).toBeHidden()
    // A click keeps it open until a click elsewhere.
    await button.click()
    await page.mouse.move(300, 700)
    await page.waitForTimeout(700)
    await expect(panel).toBeVisible()
    await page.mouse.click(300, 700)
    await expect(panel).toBeHidden()
  } finally {
    await shutdown()
  }
})

// Another project (or agent) wants you, or finished while you were elsewhere: a dot on the button, red over green, never for where you are.
async function pick(page: import('@playwright/test').Page, project: string) {
  await page.locator('.ws-button').hover()
  await page.getByRole('menu', { name: 'Projects' }).getByRole('menuitem', { name: new RegExp(project) }).click()
  await expect(page.locator('.ws-button')).toContainText(project)
}

test('a project that needs you shows a red dot on the project button while you are in another one, and its tile says how many', async () => {
  const { page, shutdown } = await office(['shop-a', 'shop-b'])
  try {
    await expect(page.getByTestId('project-dot')).toHaveCount(0)
    await pick(page, 'shop-b')
    await hire(page, { name: 'ada' })
    // In the project where the agent waits there is no dot (its own pills say it).
    await expect(page.getByTestId('project-dot')).toHaveCount(0)
    await pick(page, 'shop-a')
    const dot = page.getByTestId('project-dot')
    await expect(dot).toHaveClass(/need/)
    await expect(page.locator('.ws-button')).toContainText('Another project needs you')
    await page.locator('.ws-button').hover()
    const tile = page.getByRole('menu', { name: 'Projects' }).getByRole('menuitem', { name: /shop-b/ })
    await expect(tile.locator('.wt-need')).toHaveText('1')
    await page.waitForTimeout(300)
    await shot(page, 'quick-4-dot')
    // Going there clears it (nothing waits in the project you are in).
    await tile.click()
    await expect(page.getByTestId('project-dot')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('an agent that finishes in another project leaves a green dot until that project is opened', async () => {
  const { page, shutdown } = await office(['shop-a', 'shop-b'], undefined, { FAKE_CHAT: '1', FAKE_DELAY_MS: '600' })
  try {
    await pick(page, 'shop-b')
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    // Away first, then the message: sent from shop-b, a slow machine would switch projects after the reply was already in.
    await pick(page, 'shop-a')
    await page.evaluate((id) => window.aw.chatSend(id, 'Say something'), ada!.id)
    // The agent works and finishes its turn while you are in shop-a.
    const dot = page.getByTestId('project-dot')
    await expect(dot).toHaveClass(/done/, { timeout: SLOW })
    await page.locator('.ws-button').hover()
    await expect(page.getByRole('menu', { name: 'Projects' }).getByRole('menuitem', { name: /shop-b/ }).locator('.wt-done')).toBeVisible()
    await pick(page, 'shop-b')
    await pick(page, 'shop-a')
    await expect(page.getByTestId('project-dot')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('the agent number shows a red dot while another agent of this project waits for you, and none when only the agent you are on does', async () => {
  const { page, shutdown } = await office(['shop'])
  try {
    await hire(page, { name: 'ada' })
    await page.getByRole('tab', { name: 'Chat' }).click()
    // Only ada exists and she is the one on screen: nothing else to point at.
    await expect(page.getByTestId('agents-dot')).toHaveCount(0)
    await hire(page, { name: 'bo' })
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByTestId('agents-dot')).toHaveClass(/need/)
    await expect(page.locator('.hc-switch')).toHaveAttribute('title', /Another agent needs you/)
  } finally {
    await shutdown()
  }
})


// What a run waits for the person for (a plan, an approval, audit findings, a push) counts like a permission: in the project's tile, the dot on the project button, the agent's pill and the agent number.
const WF_PREFS = { setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: {} } }
const PLAN = { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan' }, { id: 'build', kind: 'work', name: 'Build' }] }
const waitingPlan = (home: string, agent: string, project: string) => {
  const t = Date.now()
  const readback = { goal: 'Add a toggle.', assumptions: [], outOfScope: [], questions: [] }
  appendFileSync(join(home, 'runs.jsonl'), [
    { k: 'begin', t: t - 2000, run: 'r1', agent, name: 'ada', project, title: 'Add a toggle', workflow: PLAN },
    { k: 'plan', t: t - 1000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback }
  ].map((e) => JSON.stringify(e)).join('\n') + '\n')
}

test('a plan or approval another project waits on is counted in that project\'s tile and in the dot on the project button, as a permission is', async () => {
  const { page, shutdown, home } = await office(['shop-a', 'shop-b'], undefined, {}, WF_PREFS)
  try {
    await pick(page, 'shop-b')
    await hire(page, { name: 'ada' })
    // Her permission request is answered, so only the plan will wait.
    await approve(page)
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    await pick(page, 'shop-a')
    await expect(page.getByTestId('project-dot')).toHaveCount(0)
    waitingPlan(home, ada!.id, ada!.repoPath)
    await page.reload()
    await expect(page.getByTestId('project-dot')).toHaveClass(/need/, { timeout: SLOW })
    await page.locator('.ws-button').hover()
    const tile = page.getByRole('menu', { name: 'Projects' }).getByRole('menuitem', { name: /shop-b/ })
    await expect(tile.locator('.wt-need')).toHaveText('1')
  } finally {
    await shutdown()
  }
})

test('a plan another agent of this project waits on shows in the agent number and as a pill on its tile in the agents panel', async () => {
  const { page, shutdown, home } = await office(['shop'], undefined, {}, WF_PREFS)
  try {
    await hire(page, { name: 'ada' })
    await approve(page)
    await hire(page, { name: 'bo' })
    await approve(page)
    const agents = await page.evaluate(() => window.aw.listAgents())
    const ada = agents.find((a) => a.name === 'ada')!
    await expect(page.getByTestId('agents-dot')).toHaveCount(0)
    waitingPlan(home, ada.id, ada.repoPath)
    await page.reload()
    // bo is the one on screen; ada waits on her plan.
    await page.locator('.hc-switch').hover()
    const panel = page.getByRole('menu', { name: 'Agents' })
    await expect(panel.getByRole('menuitem', { name: /ada/ }).locator('.ask-pill')).toHaveText('plan', { timeout: SLOW })
    await expect(page.getByTestId('agents-dot')).toHaveClass(/need/)
  } finally {
    await shutdown()
  }
})

test('the agents panel and the projects panel put what was active last first, and keep that order while they are open', async () => {
  const { page, shutdown } = await office(['shop-a', 'shop-b', 'shop-c'], undefined, { FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' })
  try {
    // shop-b gets two agents and shop-c one; shop-a has none.
    await pick(page, 'shop-b')
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'bo' })
    await pick(page, 'shop-c')
    await hire(page, { name: 'cy' })
    const idle = () => page.evaluate(() => window.aw.listAgents().then((l) => l.every((a) => a.activity === 'idle')))
    await expect.poll(idle, { timeout: SLOW }).toBe(true)
    const send = (name: string) => page.evaluate((n) => window.aw.listAgents().then((l) => window.aw.chatSend(l.find((a) => a.name === n)!.id, 'hello')), name)
    const names = (menu: string) => page.getByRole('menu', { name: menu }).locator('.wt-name').allInnerTexts()
    const projects = async () => {
      await page.locator('.ws-button').hover()
      const got = await expect.poll(() => names('Projects')).toHaveLength(3).then(() => names('Projects'))
      await page.mouse.move(700, 600)
      return got
    }

    // ada is spoken to last: shop-b first. Then cy: shop-c first.
    await send('ada')
    await expect.poll(async () => (await projects())[0]).toBe('shop-b')
    expect(await projects()).toEqual(['shop-b', 'shop-c', 'shop-a'])
    await send('cy')
    await expect.poll(async () => (await projects())[0]).toBe('shop-c')
    expect(await projects()).toEqual(['shop-c', 'shop-b', 'shop-a'])

    // The agents of shop-b: ada, who was spoken to last, comes before bo.
    await pick(page, 'shop-b')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const open = async () => {
      await page.locator('.hc-switch').hover()
      const got = await expect.poll(() => names('Agents')).toHaveLength(2).then(() => names('Agents'))
      return got
    }
    expect(await open()).toEqual(['ada', 'bo'])
    // While it is open the order does not move, even when bo is spoken to.
    await send('bo')
    await page.waitForTimeout(800)
    expect(await names('Agents')).toEqual(['ada', 'bo'])
    // Read again the next time it opens.
    await page.mouse.move(300, 700)
    await expect(page.getByRole('menu', { name: 'Agents' })).toBeHidden()
    await expect.poll(async () => {
      const got = await open()
      await page.mouse.move(300, 700)
      await expect(page.getByRole('menu', { name: 'Agents' })).toBeHidden()
      return got
    }).toEqual(['bo', 'ada'])
  } finally {
    await shutdown()
  }
})

