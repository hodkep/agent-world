import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// Each pane of the grid shows the agent's chat or its terminal, as chosen, and the choice stays with the workspace's grid.
async function start() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-gv-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const paths = ['alpha', 'beta'].map((n) => join(tmp, n))
  for (const p of paths) (mkdirSync(p), execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: p }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: paths[0], recent: paths }))
  const run = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  const page = await run.app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), paths[0]!)
  await page.reload()
  return { ...run, page }
}

const pane = (page: Page, label: string) => page.locator(`.pane[aria-label="${label}"]`)
const side = (page: Page) => page.getByRole('complementary', { name: 'Agents and terminals to add' })

test('a pane can show the agent\'s terminal instead of its chat, and keeps the choice across a workspace switch and a restart', async () => {
  test.setTimeout(120_000)
  const { page, shutdown } = await start()
  try {
    for (const n of ['ada', 'linus']) await hire(page, { name: n })
    if (await page.locator('.scrim').count()) await page.locator('.scrim').click({ position: { x: 5, y: 5 } })
    await page.getByRole('button', { name: 'Grid', exact: true }).click()
    await page.getByRole('toolbar', { name: 'Grid layout' }).getByRole('button', { name: 'Conversations' }).click()
    for (const n of ['ada', 'linus']) await side(page).getByRole('button', { name: new RegExp(`^${n}`) }).click()
    await expect(pane(page, "ada's conversation")).toBeVisible()
    await expect(pane(page, "linus's conversation")).toBeVisible()

    // Ada's pane turns to her terminal; Linus's stays a chat.
    await pane(page, "ada's conversation").getByRole('button', { name: "Show ada's terminal" }).click()
    const ada = pane(page, "ada's terminal")
    await expect(ada).toBeVisible()
    await expect(ada.locator('.pane-tag')).toHaveText('terminal')
    await expect(ada.locator('.xterm')).toBeVisible()
    await expect(ada.getByRole('textbox', { name: 'Message ada' })).toBeHidden()
    await expect(pane(page, "linus's conversation")).toBeVisible()

    // To another workspace and back: still her terminal.
    await page.locator('.ws-button').click()
    await page.getByRole('menuitem', { name: /beta/ }).click()
    await expect(page.locator('.ws-button')).toContainText('beta')
    await page.locator('.ws-button').click()
    await page.getByRole('menuitem', { name: /alpha/ }).click()
    await expect(page.locator('.ws-button')).toContainText('alpha')
    await expect(pane(page, "ada's terminal")).toBeVisible()
    await expect(pane(page, "linus's conversation")).toBeVisible()

    // The app opened again: the same.
    await page.reload()
    await expect(pane(page, "ada's terminal")).toBeVisible({ timeout: 30_000 })
    await expect(pane(page, "linus's conversation")).toBeVisible()

    // And back to the chat, with its message box.
    await pane(page, "ada's terminal").getByRole('button', { name: "Show ada's chat" }).click()
    await expect(pane(page, "ada's conversation").getByRole('textbox', { name: 'Message ada' })).toBeVisible()
    await page.reload()
    await expect(pane(page, "ada's conversation")).toBeVisible({ timeout: 30_000 })
  } finally {
    await shutdown()
  }
})
