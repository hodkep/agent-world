import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function start() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gpanel-')))
  const dir = join(tmp, 'shop')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  const page = await run.app.firstWindow()
  await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1440, 900))
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  return { ...run, page }
}

const tile = (page: Page, name: string) => page.getByRole('list', { name: 'All agents' }).getByRole('listitem', { name: new RegExp(`^${name}`) })
const pane = (page: Page, name: string) => page.locator(`.pane[aria-label="${name}'s conversation"]`)
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Grid layout' })
const side = (page: Page) => page.getByRole('complementary', { name: 'Agents and terminals to add' })

async function share(page: Page, el: ReturnType<typeof pane>) {
  const area = (await page.locator('.panes').boundingBox())!
  const b = (await el.boundingBox())!
  const r = (n: number) => Math.round(n * 100) / 100
  return { x: r((b.x - area.x) / area.width), y: r((b.y - area.y) / area.height), w: r(b.width / area.width), h: r(b.height / area.height) }
}

test('in the overview, the agent the side panel is showing is left out, and the one you open takes its place', async () => {
  const { page, shutdown } = await start()
  try {
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    // The panel is showing linus (hired last), so only ada is in the grid.
    await expect(page.locator('.hc-name')).toHaveText('linus')
    await expect(page.getByRole('list', { name: 'All agents' }).getByRole('listitem')).toHaveCount(1)
    await expect(tile(page, 'ada')).toBeVisible()
    await expect(tile(page, 'linus')).toHaveCount(0)

    // Opening ada in the panel swaps them: linus comes back, ada leaves.
    await tile(page, 'ada').click()
    await expect(page.locator('.hc-name')).toHaveText('ada')
    await expect(tile(page, 'linus')).toBeVisible()
    await expect(tile(page, 'ada')).toHaveCount(0)

    // With the panel closed everyone is in the grid; opened again, the one it shows leaves.
    await page.getByRole('button', { name: 'Hide panel' }).click()
    await expect(page.getByRole('list', { name: 'All agents' }).getByRole('listitem')).toHaveCount(2)
    await page.getByRole('button', { name: 'Show panel' }).click()
    await expect(page.getByRole('list', { name: 'All agents' }).getByRole('listitem')).toHaveCount(1)
    await expect(tile(page, 'ada')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('in the conversation grid, the agent open in the side panel is out of the grid until the panel closes or moves on', async () => {
  const { page, shutdown } = await start()
  try {
    for (const n of ['ada', 'linus']) await hire(page, { name: n })
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await bar(page).getByRole('button', { name: 'Conversations' }).click()
    for (const n of ['ada', 'linus']) await side(page).getByRole('button', { name: new RegExp(`^${n}`) }).click()
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(pane(page, 'linus')).toBeVisible()
    const adaBefore = await share(page, pane(page, 'ada'))
    const linusBefore = await share(page, pane(page, 'linus'))

    // Opening ada in the side panel takes her out of the grid, and linus fills the space.
    await page.getByRole('button', { name: 'Open ada in the side panel' }).click()
    await expect(page.locator('aside')).toBeVisible()
    await expect(pane(page, 'ada')).toBeHidden()
    await expect(pane(page, 'linus')).toBeVisible()
    await expect(side(page).getByRole('button', { name: /^ada/ })).toContainText('in panel')
    await expect(side(page).getByRole('button', { name: /^linus/ })).toContainText('in grid')
    const alone = await share(page, pane(page, 'linus'))
    expect(alone.w * alone.h).toBeGreaterThan(0.9)
    await page.screenshot({ path: join(tmpdir(), 'aw-grid-panel.png') })

    // The panel moves on to linus: ada is back, linus is out.
    await page.getByRole('button', { name: 'Open linus in the side panel' }).click()
    await expect(pane(page, 'linus')).toBeHidden()
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(side(page).getByRole('button', { name: /^ada/ })).toContainText('in grid')

    // Closing the panel brings everyone back, in the places they had.
    await page.getByRole('button', { name: 'Hide panel' }).click()
    await expect(page.locator('aside')).toBeHidden()
    await expect(pane(page, 'ada')).toBeVisible()
    await expect(pane(page, 'linus')).toBeVisible()
    expect(await share(page, pane(page, 'ada'))).toEqual(adaBefore)
    expect(await share(page, pane(page, 'linus'))).toEqual(linusBefore)
  } finally {
    await shutdown()
  }
})
