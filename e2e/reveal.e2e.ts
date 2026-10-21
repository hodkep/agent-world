import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { SLOW } from './waits'

// Right-click Reveal in Finder, for files and folders, in every place that shows a path. The system menu cannot be clicked from a test: with AW_REVEAL_LOG an app that is not
// installed writes the choice to a log instead ("menu <path>" for the menu, "show <path>" for a click that reveals at once).
test('right-click offers Reveal in Finder on a file or a folder in the Code tab, the chat, the agent\'s card and tabs, and a path that is not there offers nothing', async () => {
  test.setTimeout(120_000)
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-reveal-')))
  const repo = join(tmp, 'shop')
  mkdirSync(join(repo, 'src', 'lib'), { recursive: true })
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(tmp, 'init', '-q', '-b', 'main', repo)
  writeFileSync(join(repo, 'src', 'lib', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src', 'health.ts'), 'export const ok = false\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'accounts', 'work'), { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, accounts: [{ id: 'work', name: 'Work', provider: 'claude' }] }))
  const log = join(tmp, 'reveal.log')
  const lines = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [])
  const { app, shutdown } = await launchApp(
    { AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_FOLDERS: '1', AW_REVEAL_LOG: log },
    tmp
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 950 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const cwd = ada!.cwd
    const right = async (target: ReturnType<typeof page.locator>) => {
      const before = lines().length
      await target.click({ button: 'right' })
      await expect.poll(() => lines().length, { timeout: 10_000 }).toBe(before + 1)
      return lines().at(-1)
    }

    // The agent's folder, from its tabs and its card.
    expect(await right(page.getByRole('tab', { name: 'Terminal' }))).toBe(`menu ${cwd}`)
    expect(await right(page.getByRole('tab', { name: 'Code' }))).toBe(`menu ${cwd}`)

    // Code › Files: a folder and a file; an open file's tab and its path line.
    await page.getByRole('tab', { name: 'Code' }).click()
    await page.getByRole('tab', { name: 'Files' }).click()
    const tree = page.getByRole('tree')
    expect(await right(tree.locator('button[title="src"]'))).toBe(`menu ${join(cwd, 'src')}`)
    await tree.locator('button[title="src"]').click()
    await tree.locator('button[title="src/lib"]').click()
    expect(await right(tree.locator('button[title="src/lib"]'))).toBe(`menu ${join(cwd, 'src', 'lib')}`)
    await tree.locator('button[title="src/lib/a.ts"]').click()
    expect(await right(tree.locator('button[title="src/lib/a.ts"]'))).toBe(`menu ${join(cwd, 'src', 'lib', 'a.ts')}`)
    expect(await right(page.getByRole('tablist', { name: 'Open files' }).getByRole('tab', { name: /a\.ts/ }))).toBe(`menu ${join(cwd, 'src', 'lib', 'a.ts')}`)

    // Code › Changes: a file the agent has changed and not committed yet.
    writeFileSync(join(cwd, 'src', 'lib', 'b.ts'), 'export const b = 2\n')
    await page.getByRole('tab', { name: 'Changes' }).click()
    const row = page.locator('.change-list .file', { hasText: 'b.ts' }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })
    expect(await right(row)).toBe(`menu ${join(cwd, 'src', 'lib', 'b.ts')}`)

    // The chat: a folder the agent names is a link (a click reveals it), and so is a file; a folder that is not there is left as written.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('where is everything')
    await box.press('Enter')
    const reply = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.assistant').filter({ hasText: 'The pages are in' })
    await expect(reply.locator('a.folder-link')).toHaveText(['guide', 'lib'], { timeout: SLOW })
    await expect(reply).toContainText('missing/dir/')
    expect(await right(reply.locator('a.folder-link', { hasText: 'guide' }))).toBe(`menu ${join(cwd, 'docs', 'guide')}`)
    const before = lines().length
    await reply.locator('a.folder-link', { hasText: 'lib' }).click()
    await expect.poll(() => lines().slice(before)).toEqual([`show ${join(cwd, 'src', 'lib')}`])
    // The Edit the agent made is a chip in the chat with the file's path.
    expect(await right(page.locator('.tc-file', { hasText: 'health.ts' }).first())).toBe(`menu ${join(cwd, 'src', 'health.ts')}`)

    // The profile card: right-click the branch line for the agent's folder.
    await page.locator('.hc-name').first().click()
    expect(await right(page.locator('.pc').getByText('aw/ada').first())).toBe(`menu ${cwd}`)
    await page.getByRole('button', { name: 'Close profile card' }).click()

    // A path that is not there offers nothing.
    const n = lines().length
    expect(await page.evaluate(([id]) => window.aw.revealMenu(id!, 'no/such/folder'), [ada!.id])).toBe(false)
    expect(lines().length).toBe(n)

    // Settings: an account's folder.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    expect(await right(settings.locator('.acct', { hasText: 'Work' }).locator('small'))).toBe(`menu ${join(home, 'accounts', 'work')}`)
  } finally {
    await shutdown()
  }
})
