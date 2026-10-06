import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('a base left over from hiring is noticed and changed in the app, and a new agent can start from another branch', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-base-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  // An older branch the agent will wrongly be compared with, and a main that has moved on since.
  git(repo, 'branch', 'old')
  for (let i = 0; i < 8; i++) writeFileSync(join(repo, `n${i}.ts`), 'x\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'more')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    expect(agent!.base).toBe('main')
    // The stored base goes stale: the app can set it, but only to a branch that is there.
    await expect(page.evaluate((id) => window.aw.code.setBase(id, 'nope'), agent!.id)).rejects.toThrow('There is no branch called nope')
    await page.evaluate((id) => window.aw.code.setBase(id, 'old'), agent!.id)
    await page.getByRole('tab', { name: 'Code' }).click()
    const list = page.locator('.change-list')
    await expect(list.getByRole('button', { name: 'Compared with: old' })).toBeVisible()
    await expect(list.getByRole('button', { name: /8 files/ })).toBeVisible()
    // The note says what is odd and offers the fix in one click.
    const note = list.getByRole('status')
    await expect(note).toContainText('No changes against main')
    if (process.env.AW_SHOTS) await list.screenshot({ path: `${process.env.AW_SHOTS}/changes-stale.png` })
    await note.getByRole('button', { name: 'Compare with main' }).click()
    await expect(list.getByRole('button', { name: 'Compared with: main' })).toBeVisible()
    await expect(list.getByText('No changes yet.')).toBeVisible()
    await expect(note).toHaveCount(0)
    expect((await page.evaluate(() => window.aw.listAgents()))[0]!.base).toBe('main')

    // The picker lists branches, never the agent's own, and switching shows the comparison at once.
    await list.getByRole('button', { name: 'Compared with: main' }).click()
    const picker = page.getByRole('dialog', { name: 'Compared with' })
    await expect(picker.getByRole('option', { name: /^old/ })).toBeVisible()
    await expect(picker.getByRole('option', { name: /aw\// })).toHaveCount(0)
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/changes-picker.png` })
    await picker.getByRole('option', { name: /^old/ }).click()
    await expect(list.getByRole('button', { name: 'Compared with: old' })).toBeVisible()
    await expect(list.getByRole('button', { name: /8 files/ })).toBeVisible()
    // Keep it: the note goes and stays away.
    await list.getByRole('status').getByRole('button', { name: 'Keep it' }).click()
    await expect(list.getByRole('status')).toHaveCount(0)
    // Land on…: the merge button and menu follow the base.
    await expect(list.getByRole('button', { name: 'Merge into old' })).toBeVisible()
    await list.getByRole('button', { name: 'More ways to finish' }).click()
    await expect(list.getByRole('menuitem', { name: /Push & open PR/ })).toContainText('against old')

    // A new agent can start from another branch than the folder's own.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await expect(form.getByRole('button', { name: 'Branch from: main' })).toBeVisible()
    await form.getByRole('button', { name: 'Branch from: main' }).click()
    await page.getByRole('dialog', { name: 'Branch from' }).getByRole('option', { name: /^old/ }).click()
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    await expect.poll(async () => (await page.evaluate(() => window.aw.listAgents())).map((a) => a.base)).toContain('old')
    const second = (await page.evaluate(() => window.aw.listAgents())).find((a) => a.base === 'old' && a.id !== agent!.id)!
    expect(git(second.cwd, 'rev-parse', 'HEAD')).toBe(git(repo, 'rev-parse', 'old'))
  } finally {
    await shutdown()
  }
})
