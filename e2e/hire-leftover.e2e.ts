import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

async function start() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-left-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  // An earlier agent: hired, given work (one commit, one loose file), then removed with its worktree kept.
  const left = await page.evaluate(async (f) => {
    const a = await window.aw.addAgent(f, {}, 'ada')
    return { id: a.id, cwd: a.cwd }
  }, repo)
  writeFileSync(join(left.cwd, 'done.txt'), 'work\n')
  git(left.cwd, 'add', '.')
  git(left.cwd, 'commit', '-qm', 'ada work')
  writeFileSync(join(left.cwd, 'loose.txt'), 'x\n')
  await page.evaluate((id) => window.aw.removeAgent(id, 'keep-worktree'), left.id)
  await page.reload()
  const openForm = async (name: string) => {
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill(name)
    return form
  }
  return { page, shutdown, left, openForm }
}

test('a name an earlier agent left behind is said in the hire form, with what is in it, and can be removed or carried on from', async () => {
  const { page, shutdown, left, openForm } = await start()
  try {
    // The notice names the work, and Hire waits for a choice.
    let form = await openForm('ada')
    const notice = form.getByRole('alert', { name: 'Left over from an earlier agent' })
    await expect(notice).toContainText('aw/ada is left over from an earlier agent: 1 commit not merged, 1 file with uncommitted changes.')
    await expect(form.getByRole('button', { name: 'Hire', exact: true })).toBeDisabled()
    // Nothing shows up behind the form.
    await expect(page.locator('.error')).toHaveCount(0)

    // Carry on from it: the new agent works in that folder, with the commit and the loose file.
    await notice.getByRole('button', { name: 'Hire on it' }).click()
    await form.waitFor({ state: 'detached' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    expect(ada!.branch).toBe('aw/ada')
    expect(ada!.cwd).toBe(left.cwd)
    expect(existsSync(join(ada!.cwd, 'done.txt'))).toBe(true)
    expect(existsSync(join(ada!.cwd, 'loose.txt'))).toBe(true)

    // The name is in use now: another agent of that name is refused in the form, not behind it.
    form = await openForm('ada')
    await form.getByRole('button', { name: 'Hire', exact: true }).click()
    await expect(form.getByRole('alert').filter({ hasText: 'There is already an agent named ada.' })).toBeVisible()
    await expect(page.locator('.error')).toHaveCount(0)
    await form.getByRole('button', { name: 'Cancel' }).click()
  } finally {
    await shutdown()
  }
})

test('removing what an earlier agent left asks first when work would be lost, then hires fresh from the base', async () => {
  const { page, shutdown, openForm } = await start()
  try {
    const form = await openForm('ada')
    const notice = form.getByRole('alert', { name: 'Left over from an earlier agent' })
    await notice.getByRole('button', { name: 'Remove it and hire' }).click()
    await expect(notice).toContainText('This deletes aw/ada with 1 commit not merged and 1 file with uncommitted changes.')
    // Keep it: back to the two choices, nothing deleted.
    await notice.getByRole('button', { name: 'Keep it' }).click()
    await expect(notice.getByRole('button', { name: 'Hire on it' })).toBeVisible()
    await notice.getByRole('button', { name: 'Remove it and hire' }).click()
    await notice.getByRole('button', { name: 'Delete it and hire' }).click()
    await form.waitFor({ state: 'detached' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    expect(ada!.branch).toBe('aw/ada')
    expect(existsSync(join(ada!.cwd, 'done.txt'))).toBe(false)
    expect(existsSync(join(ada!.cwd, 'loose.txt'))).toBe(false)
  } finally {
    await shutdown()
  }
})

test('a leftover that another agent still uses (renamed since) cannot be taken: the form says who', async () => {
  const { page, shutdown, openForm } = await start()
  try {
    // bo is hired on its own branch, then renamed: the branch keeps the name it was made with.
    const bo = await page.evaluate(async () => {
      const folder = localStorage.getItem('aw.folder')!
      const a = await window.aw.addAgent(folder, {}, 'bo')
      await window.aw.renameAgent(a.id, 'robin')
      return a.id
    })
    expect(bo).toBeTruthy()
    const form = await openForm('bo')
    const notice = form.getByRole('alert', { name: 'Left over from an earlier agent' })
    await expect(notice).toContainText('aw/bo is still used by robin. Pick another name.')
    await expect(notice.getByRole('button')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('clearing the name takes the notice away and leaves the form working, and the error page\'s Reload really reloads the window', async () => {
  const { page, shutdown, openForm } = await start()
  try {
    const form = await openForm('ada')
    const notice = form.getByRole('alert', { name: 'Left over from an earlier agent' })
    await expect(notice).toBeVisible()
    await form.getByLabel('Name').fill('')
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('alert').filter({ hasText: 'Something went wrong' })).toHaveCount(0)
    await expect(form.getByLabel('Name')).toBeVisible()

    // The error page's Reload asks the main process, because the page cannot reload itself: the window must come back fresh from it.
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    // The reload can end the page before this call returns.
    await page.evaluate(() => window.aw.reloadWindow()).catch(() => {})
    await expect.poll(() => page.evaluate(() => (window as unknown as { marker?: number }).marker ?? 0).catch(() => 1), { timeout: 10_000 }).toBe(0)
  } finally {
    await shutdown()
  }
})
