import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { handoffText } from '../src/shared/handoff'
import { replyTail } from '../src/shared/mail'
import { approve, hire, launchApp } from './launch'

async function project(connected: boolean, env: (tmp: string) => Record<string, string> = () => ({})) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-handoff-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  const agyHome = join(tmp, 'agy')
  mkdirSync(agyHome)
  const config = join(tmp, 'mcp_config.json')
  // agy counts as connected to the message box once its list holds the entry that starts our bridge.
  if (connected) writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: 'x', args: [join(home, 'bin', 'aw-mcp-bridge.cjs')] } } }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, FAKE_DELAY_MS: '50', ...env(tmp) }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { page, shutdown, git, repo }
}

async function openHandoff(page: Page) {
  await page.getByRole('tab', { name: 'Chat' }).click()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Hand off…' }).click()
  return page.getByRole('dialog', { name: /Hand off .*'s work/ })
}

test('work is handed to another agent with a note; the receiver sees it as a card, and agents that cannot answer are not offered', async () => {
  // The fake claude does not write what is pasted into it to its conversation, so what a real one would record is given to it.
  const delivered = handoffText({ kind: 'review', from: 'ada', branch: 'aw/ada', base: 'main', worktree: '/w/ada', note: 'the auth change is the risky part' })
  const { page, shutdown } = await project(false, (tmp) => {
    const file = join(tmp, 'delivered.txt')
    writeFileSync(file, `[Agent World] Message from ada: ${delivered}\n\n${replyTail('ada')}`)
    return { FAKE_USER_FILE: file, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), FAKE_TRANSCRIPT: '1', FAKE_CHAT: '1' }
  })
  try {
    await hire(page, { name: 'ada' })
    await hire(page, { name: 'linus' })
    await page.locator('.roster button', { hasText: 'ada' }).click()
    const dialog = await openHandoff(page)
    // agy is installed but not connected to the message box: it cannot be hired for this, and the row says why.
    const agyRow = dialog.getByRole('radio', { name: /Hire a new agy/ })
    await expect(agyRow).toBeDisabled()
    await expect(agyRow).toContainText('not connected to the message box')
    await dialog.getByRole('radio', { name: /linus/ }).click()
    await dialog.getByRole('radio', { name: /Review/ }).click()
    await dialog.getByLabel('Anything to add (optional)').fill('the auth change is the risky part')
    await expect(dialog.locator('.ho-preview')).toContainText('Hand-off (review) from ada: branch aw/ada, based on main.')
    await dialog.getByRole('button', { name: 'Send hand-off' }).click()
    await expect(dialog).toBeHidden()

    await page.locator('.roster button', { hasText: 'linus' }).click()
    // The office's own record of the message: from ada to linus, with the hand-off in it.
    await page.getByRole('tab', { name: /^Traces/ }).click()
    const log = page.locator('.traces .message').first()
    await expect(log).toContainText('ada')
    await expect(log).toContainText('linus')
    await expect(log).toContainText('Hand-off (review) from ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.getByRole('article', { name: 'Hand-off from agent ada' }).last()
    await expect(card).toContainText('Review')
    await expect(card).toContainText('aw/ada')
    await expect(card).toContainText('git diff main...aw/ada')
    await expect(card).toContainText('the auth change is the risky part')
  } finally {
    await shutdown()
  }
})

test('continuing hands the work to a new agy agent whose own branch starts from the sender\'s commits', async () => {
  const { page, shutdown } = await project(true)
  try {
    await hire(page, { name: 'ada' })
    await approve(page)
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const g = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: ada!.cwd, encoding: 'utf8' })
    writeFileSync(join(ada!.cwd, 'login.ts'), 'export const ok = true\n')
    g('add', '.')
    g('commit', '-qm', 'work by ada')
    await page.locator('.roster button', { hasText: 'ada' }).click()
    const dialog = await openHandoff(page)
    await dialog.getByRole('radio', { name: /Hire a new agy/ }).click()
    await dialog.getByRole('radio', { name: /Continue/ }).click()
    await expect(dialog.locator('.ho-preview')).toContainText('Your branch starts from aw/ada')
    await dialog.getByRole('button', { name: 'Send hand-off' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('.roster button')).toHaveCount(2)
    const agents = await page.evaluate(() => window.aw.listAgents())
    const fresh = agents.find((a) => a.name !== 'ada')!
    expect(fresh.provider).toBe('agy')
    expect(fresh.branch).toBe(`aw/${fresh.name}`)
    // Its branch was made from ada's, so her commit is already in its history.
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: fresh.cwd, encoding: 'utf8' })).toContain('work by ada')
  } finally {
    await shutdown()
  }
})
