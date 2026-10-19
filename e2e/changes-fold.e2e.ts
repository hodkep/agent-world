import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const LINES = (change: (n: number) => string) => Array.from({ length: 60 }, (_, i) => change(i + 1)).join('\n') + '\n'
const plain = (n: number) => `export const line${n} = ${n}`

async function start() {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-fold-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(join(repo, 'src'), { recursive: true })
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'src', 'big.ts'), LINES(plain))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page)
  const [agent] = await page.evaluate(() => window.aw.listAgents())
  // The agent changes line 2 and line 58 of a 60-line file, and adds a new file.
  writeFileSync(join(agent!.cwd, 'src', 'big.ts'), LINES((n) => (n === 2 || n === 58 ? `export const line${n} = ${n} * 2` : plain(n))))
  writeFileSync(join(agent!.cwd, 'src', 'fresh.ts'), 'export const fresh = 1\nexport const fresher = 2\n')
  git(agent!.cwd, 'add', '-A')
  await page.getByRole('tab', { name: 'Code' }).click()
  await page.getByRole('tab', { name: 'Changes', exact: true }).click()
  return { page, shutdown }
}

const open = async (page: Page, file: RegExp) => page.locator('.change-list ul').getByRole('button', { name: file }).click()
const hidden = (page: Page) => page.locator('.diff .diff-hidden-lines', { hasText: 'hidden lines' })
const showing = (page: Page, text: string) => page.locator('.diff .view-line', { hasText: text })

test('the Changes tab folds the code around the changes, with a choice of how much stays and a key to flip it, and keeps the choice', async () => {
  const { page, shutdown } = await start()
  try {
    await open(page, /big\.ts/)
    await expect(page.locator('.fcrumb')).toContainText('src/big.ts')
    const fold = page.getByRole('group', { name: 'Unchanged code' })
    // Folded by default, 3 lines around each change: the two changes are in view, the middle is a row that says how much is hidden.
    await expect(fold.getByRole('button', { name: 'Fold' })).toHaveAttribute('aria-pressed', 'true')
    await expect(showing(page, 'line58 = 58 * 2').first()).toBeVisible()
    await expect(showing(page, 'line30 = 30')).toHaveCount(0)
    await expect(hidden(page)).toHaveCount(1)
    const hiddenCount = async () => Number(/(\d+)/.exec((await hidden(page).innerText()) ?? '')?.[1])
    const at3 = await hiddenCount()
    expect(at3).toBeGreaterThan(40)

    // More context keeps more lines in view: fewer are hidden.
    await page.locator('.fold-ctl select').selectOption('10')
    await expect.poll(hiddenCount).toBeLessThan(at3 - 8)

    // Show turns the fold off, and the page remembers it across a reload.
    await fold.getByRole('button', { name: 'Show' }).click()
    await expect(fold.getByRole('button', { name: 'Show' })).toHaveAttribute('aria-pressed', 'true')
    await expect(hidden(page)).toHaveCount(0)
    await expect(showing(page, 'line30 = 30').first()).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('tab', { name: 'Changes', exact: true }).click()
    await open(page, /big\.ts/)
    await expect(page.getByRole('group', { name: 'Unchanged code' }).getByRole('button', { name: 'Show' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.fold-ctl select')).toHaveValue('10')

    // The arrow keys switch inside the group, and the shortcut flips it from the diff.
    await page.getByRole('group', { name: 'Unchanged code' }).getByRole('button', { name: 'Show' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('group', { name: 'Unchanged code' }).getByRole('button', { name: 'Fold' })).toHaveAttribute('aria-pressed', 'true')
    await expect(hidden(page)).toHaveCount(1)
    await page.locator('.fcrumb .fpath').click()
    await page.keyboard.press('ControlOrMeta+Alt+KeyU')
    await expect(hidden(page)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+Alt+KeyU')
    await expect(hidden(page)).toHaveCount(1)
  } finally {
    await shutdown()
  }
})

test('a new file has nothing to fold, and a change in a folded diff is asked about with its real line number', async () => {
  const { page, shutdown } = await start()
  try {
    await open(page, /fresh\.ts/)
    await expect(showing(page, 'fresher').first()).toBeVisible()
    await expect(hidden(page)).toHaveCount(0)

    await open(page, /big\.ts/)
    await expect(hidden(page)).toHaveCount(1)
    const ask = page.getByRole('button', { name: /^Ask ada/ })
    const line = showing(page, 'line58 = 58 * 2').last()
    await expect(line).toBeVisible()
    // Dragged across the words of the changed line, as a person would; the editor draws its lines again as the diff settles, so the line is found anew each try.
    await expect(async () => {
      const box = await showing(page, 'line58 = 58 * 2').last().boundingBox()
      expect(box).not.toBeNull()
      const editor = (await page.locator('.diff').boundingBox())!
      const from = box!.x + 10
      const to = Math.min(from + 160, editor.x + editor.width - 60)
      await page.mouse.move(from, box!.y + box!.height / 2)
      await page.mouse.down()
      await page.mouse.move(to, box!.y + box!.height / 2, { steps: 6 })
      await page.mouse.up()
      await ask.click({ timeout: 2000 })
    }).toPass({ timeout: 20_000 })
    await expect(page.getByRole('group', { name: 'In the message to the agent' }).locator('.ctx-chip')).toHaveText(['big.ts:58'])
  } finally {
    await shutdown()
  }
})

test('the rows of hidden lines are mouse-only in the editor, so the palette can show them all without turning the fold off', async () => {
  const { page, shutdown } = await start()
  try {
    await open(page, /big\.ts/)
    await expect(hidden(page)).toHaveCount(1)
    await showing(page, 'line58 = 58 * 2').last().click()
    await page.keyboard.press('F1')
    await page.keyboard.type('Show all hidden lines')
    await page.keyboard.press('Enter')
    await expect(hidden(page)).toHaveCount(0)
    await expect(showing(page, 'line30 = 30').first()).toBeVisible()
    // Still Fold: the next file folds again.
    await expect(page.getByRole('group', { name: 'Unchanged code' }).getByRole('button', { name: 'Fold' })).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await shutdown()
  }
})
