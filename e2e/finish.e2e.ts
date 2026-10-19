import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, hire, launchApp } from './launch'

test('finishing checks the work is ready, squashes it onto the base branch and retires the agent (the call the app keeps; the screen for it is gone)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')

    await chatTab(page)
    // Nothing sits above the message box about it: landing is no longer a panel of the chat.
    await expect(page.locator('.finish-band')).toHaveCount(0)
    const ready = await page.evaluate((id) => window.aw.finishStatus(id, { readOnly: true }), ada!.id)
    expect(ready).toMatchObject({ branch: 'aw/ada', base: 'main', ahead: 1, uncommitted: 0, baseReady: true, conflicts: [] })
    await page.evaluate((id) => window.aw.finishRun(id, { squash: true, message: 'Add a health check', cleanup: true }), ada!.id)

    expect(git(repo, 'log', '--format=%s', 'main').split('\n')).toEqual(['Add a health check', 'init'])
    expect(git(repo, 'branch', '--list', 'aw/*')).toBe('')
    await page.reload()
    await expect(page.locator('.roster button')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('finishing says what is in the way instead of landing', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')
    writeFileSync(join(ada!.cwd, 'wip.ts'), 'x\n')
    await chatTab(page)
    const status = await page.evaluate((id) => window.aw.finishStatus(id, { readOnly: true }), ada!.id)
    expect(status).toMatchObject({ ahead: 1, uncommitted: 1 })
    const refused = await page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }).then(() => 'landed', (e: Error) => e.message), ada!.id)
    expect(refused).toContain('uncommitted')
    expect(git(repo, 'log', '--format=%s', 'main')).toBe('init')
  } finally {
    await shutdown()
  }
})

test('a branch that shares no history with its base says so in one red line at the end of the chat, counts no commits and cannot be landed', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-finish-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    // main was rewritten after the branch began: the same work now sits on a history git cannot join to main's.
    git(ada!.cwd, 'checkout', '-q', '--orphan', 'rewritten')
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health')
    git(ada!.cwd, 'branch', '-M', 'rewritten', 'aw/ada')
    await chatTab(page)
    const line = page.getByRole('note', { name: "ada's branch has no shared history" })
    await expect(line).toContainText("This branch does not come from main's history: reset it onto main before landing", { timeout: 15_000 })
    // It is in the conversation, not above the message box, and it carries no count and no "No conflicts".
    await expect(page.locator('.chat-log').getByRole('note', { name: "ada's branch has no shared history" })).toHaveCount(1)
    await expect(line).not.toContainText('No conflicts')
    await expect(line).not.toContainText('commit on aw/ada to land')
    const status = await page.evaluate((id) => window.aw.finishStatus(id, { readOnly: true }), ada!.id)
    expect(status).toMatchObject({ unrelated: true, ahead: 0, conflicts: [] })
    // The server refuses too, in the same words.
    await expect(page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }), ada!.id)).rejects.toThrow(/does not come from main's history/)
  } finally {
    await shutdown()
  }
})
