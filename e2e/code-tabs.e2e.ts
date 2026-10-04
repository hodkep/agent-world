import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

async function start() {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-ftabs-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(join(repo, 'src', 'lib'), { recursive: true })
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n\nA small shop.\n')
  writeFileSync(join(repo, 'src', 'cart.ts'), 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0)\nexport const empty = []\n')
  writeFileSync(join(repo, 'src', 'lib', 'money.ts'), 'export const fmt = (n: number) => `$${n.toFixed(2)}`\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Code' }).click()
  await page.getByRole('tab', { name: 'Files', exact: true }).click()
  return { page, shutdown, git }
}

const tree = (page: import('@playwright/test').Page) => page.locator('.change-list .tree')
const tabs = (page: import('@playwright/test').Page) => page.getByRole('tablist', { name: 'Open files' })

test('files open as tabs, the tree follows the tab shown, and unsaved tabs ask before closing', async () => {
  const { page, shutdown } = await start()
  try {
    // The tree starts closed; opening files from it makes tabs, and a file opened twice has one tab.
    await tree(page).getByRole('button', { name: /README\.md/ }).click()
    await expect(tabs(page).getByRole('tab')).toHaveText(['README.md×'])
    await tree(page).locator('button.is-dir').filter({ hasText: /^▸src$/ }).click()
    await tree(page).getByRole('button', { name: /cart\.ts/ }).click()
    await tree(page).getByRole('button', { name: /README\.md/ }).click()
    await expect(tabs(page).getByRole('tab')).toHaveText(['README.md×', 'cart.ts×'])
    await expect(tabs(page).getByRole('tab', { selected: true })).toHaveText('README.md×')
    await expect(page.locator('.diff')).toContainText('A small shop')

    // Switching tabs shows that file, and its folders open in the tree even if they were folded away.
    await tree(page).locator('button.is-dir').filter({ hasText: /^▾src$/ }).click()
    await expect(tree(page).getByRole('button', { name: /cart\.ts/ })).toHaveCount(0)
    await tabs(page).getByRole('tab', { name: /cart\.ts/ }).click()
    await expect(page.locator('.diff')).toContainText('reduce')
    await expect(tree(page).locator('li.on')).toContainText('cart.ts')
    await expect(page.locator('.fcrumb')).toContainText('src/cart.ts')

    // Editing marks the tab; closing it asks first, keeping or discarding as chosen.
    await page.locator('.diff .view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('// more')
    await expect(tabs(page).getByRole('tab', { name: /cart\.ts/ }).locator('.fdot')).toBeVisible()
    await tabs(page).getByRole('button', { name: 'Close cart.ts' }).click()
    await expect(page.locator('.fask')).toContainText('Discard unsaved changes to cart.ts?')
    await page.getByRole('button', { name: 'Keep editing' }).click()
    await expect(tabs(page).getByRole('tab')).toHaveCount(2)
    await tabs(page).getByRole('button', { name: 'Close cart.ts' }).click()
    await page.getByRole('button', { name: 'Discard' }).click()
    await expect(tabs(page).getByRole('tab')).toHaveText(['README.md×'])
    await expect(page.locator('.diff')).toContainText('A small shop')

    // The last tab closes to the empty editor, and the ◎ button is gone.
    await tabs(page).getByRole('button', { name: 'Close README.md' }).click()
    await expect(page.locator('.diff')).toHaveAttribute('data-hint', 'Pick a file to edit it')
    await expect(page.getByRole('button', { name: 'Show the open file in the tree' })).toHaveCount(0)

    // Tabs stay when flipping to Changes and back.
    await tree(page).getByRole('button', { name: /README\.md/ }).click()
    await page.getByRole('tab', { name: 'Changes', exact: true }).click()
    await page.getByRole('tab', { name: 'Files', exact: true }).click()
    await expect(tabs(page).getByRole('tab')).toHaveText(['README.md×'])
    await expect(page.locator('.diff')).toContainText('A small shop')
  } finally {
    await shutdown()
  }
})

test('selected code goes into the message as a chip, from the Files tab and from a diff on the Changes tab', async () => {
  const { page, shutdown, git } = await start()
  try {
    const box = page.getByRole('textbox', { name: 'Message ada' })
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    // Select the first line of a file: Home, then Shift+End.
    await tree(page).getByRole('button', { name: /README\.md/ }).click()
    await page.locator('.diff .view-line', { hasText: '# shop' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    const ask = page.getByRole('button', { name: /^Ask ada/ })
    await expect(ask).toBeVisible()
    await ask.click()
    const tray = page.getByRole('group', { name: 'In the message to the agent' })
    await expect(tray.locator('.ctx-chip')).toHaveText(['README.md:1'])
    // The editor stays where it was, and ⌘L adds another selection.
    await page.locator('.diff .view-line', { hasText: 'A small shop' }).click()
    await page.keyboard.press('Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.press('ControlOrMeta+l')
    await expect(tray.locator('.ctx-chip')).toHaveCount(2)
    // The same lines twice are one chip.
    await page.keyboard.press('ControlOrMeta+l')
    await expect(tray.locator('.ctx-chip')).toHaveCount(2)

    // A change the agent made, selected in the diff, goes with what it was before.
    writeFileSync(join(agent!.cwd, 'src', 'cart.ts'), 'export const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0) * 1.2\nexport const empty = []\n')
    git(agent!.cwd, 'status')
    await page.getByRole('tab', { name: 'Changes', exact: true }).click()
    await page.locator('.change-list ul').getByRole('button', { name: /cart\.ts/ }).click()
    await expect(page.locator('.diff')).toContainText('1.2')
    // Dragged across the changed line, as a person would (the line may be wider than the editor, so by the editor's own edges).
    const changed = page.locator('.diff .view-line', { hasText: '1.2' }).last()
    await expect(changed).toBeVisible()
    const line = (await changed.boundingBox())!
    const editor = (await page.locator('.diff').boundingBox())!
    await page.mouse.move(editor.x + 70, line.y + line.height / 2)
    await page.mouse.down()
    await page.mouse.move(editor.x + editor.width - 40, line.y + line.height / 2, { steps: 6 })
    await page.mouse.up()
    await page.getByRole('button', { name: /^Ask ada/ }).click()
    await expect(tray.locator('.ctx-chip')).toHaveCount(3)

    // The chips are in the message box, and the message carries the code; it reads as cards in the conversation.
    await tray.getByRole('button', { name: 'Open chat' }).click()
    await expect(page.locator('.attached li.chip-context')).toHaveCount(3)
    await expect(page.locator('.attached li.chip-context .chip-from').first()).toHaveText('Code')
    await box.fill('what do these do?')
    await box.press('Enter')
    const sent = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(sent.locator('.code-card')).toHaveCount(3, { timeout: 10_000 })
    await expect(sent).toContainText('what do these do?')
    await expect(sent.locator('.code-card').nth(2).locator('summary')).toContainText('cart.ts')
    await expect(sent.locator('.code-card').nth(2).locator('summary')).toContainText('after the change')
    await sent.locator('.code-card').nth(2).locator('summary').click()
    await expect(sent.locator('.code-card').nth(2)).toContainText('Before the change')
  } finally {
    await shutdown()
  }
})
