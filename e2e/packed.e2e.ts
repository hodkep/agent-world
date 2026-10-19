import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { changelogSection } from '../src/shared/changelog'

/**
 * Starts the PACKED app (pnpm run pack, or a dmg that was installed) the way Finder starts it: a bare PATH and a home folder of its own, with its bundled
 * git chosen on purpose, and hires an agent in a git project. It proves the git that comes with the app runs and is what creates the agent's worktree.
 *   PACKED_APP="/path/to/Agent World.app/Contents/MacOS/Agent World" pnpm exec playwright test e2e/packed.e2e.ts
 */
test('the packed app runs its own bundled git, from a bare path and a home of its own, and hires an agent with it', async () => {
  test.skip(!process.env.PACKED_APP, 'set PACKED_APP to the executable of a packed app')
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-packed-')))
  const home = join(tmp, 'home')
  mkdirSync(home)
  const project = join(tmp, 'project')
  mkdirSync(project)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project })
  execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=dev', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: project })
  const app = await electron.launch({
    executablePath: process.env.PACKED_APP!,
    args: [],
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, USER: 'fresh', SHELL: '/bin/zsh', AW_HOME: join(tmp, 'aw'), AW_NO_SETUP: '1', AW_GIT: 'bundled', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', AW_ZOOM: '1', AW_AGY_BIN: '/no/such/agy' }
  })
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    const info = await page.evaluate(() => window.aw.gitInfo())
    expect(info?.source).toBe('bundled')
    expect(info?.bin).toMatch(/Resources\/git\/bin\/git$/)
    expect(existsSync(info!.bin)).toBe(true)
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Name').fill('ada')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    // The worktree was made by the bundled git: it is there, on its own branch.
    await expect.poll(() => existsSync(join(tmp, 'aw', 'worktrees')), { timeout: 20_000 }).toBe(true)
    const branches = execFileSync('git', ['branch', '--list', 'aw/ada'], { cwd: project, encoding: 'utf8' })
    expect(branches).toContain('aw/ada')
  } finally {
    await app.close()
  }
})

// The app is the packed one, started as Finder starts it, with a home of its own (and preferences when a case needs them).
async function packed(executable: string, prefs?: object) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-packed-')))
  const home = join(tmp, 'aw')
  mkdirSync(home)
  if (prefs) writeFileSync(join(home, 'preferences.json'), JSON.stringify(prefs))
  const app = await electron.launch({
    executablePath: executable,
    args: [],
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: join(tmp, 'home'), USER: 'fresh', SHELL: '/bin/zsh', AW_HOME: home, AW_NO_SETUP: '1', AW_GIT: 'bundled', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }
  })
  return { app, page: await app.firstWindow() }
}
const whatsNew = async (page: Awaited<ReturnType<typeof packed>>['page']) => {
  await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await settings.getByRole('tab', { name: 'Updates' }).click()
  await settings.getByRole('button', { name: "What's new" }).click()
  return page.getByRole('dialog', { name: /What's new in/ })
}

test("the packed app reads its own bundled CHANGELOG.md at run time for What's new, and says nothing of an update on its first start", async () => {
  test.skip(!process.env.PACKED_APP, 'set PACKED_APP to the executable of a packed app')
  const bundled = join(dirname(process.env.PACKED_APP!), '..', 'Resources', 'CHANGELOG.md')
  expect(existsSync(bundled)).toBe(true)
  const { app, page } = await packed(process.env.PACKED_APP!)
  try {
    const { version } = await page.evaluate(() => window.aw.appInfo())
    const expected = changelogSection(readFileSync(bundled, 'utf8'), version)
    expect(expected, `the bundled changelog has a section for ${version}`).not.toBeNull()
    const dialog = await whatsNew(page)
    const notes = dialog.getByRole('region', { name: `Notes of ${version}` })
    // Words from the first note of the real file, as the app drew them.
    const first = expected!.body.split('\n').find((l) => l.startsWith('- '))!.replace(/[`*_[\]()]|https?:\/\/\S+/g, '').trim().split(/\s+/).slice(1, 5).join(' ')
    await expect(notes).toContainText(first)
    if (expected!.date) await expect(dialog).toContainText(expected!.date)
    // A fresh install is not "updated": no line about it, and the version is only learnt.
    await expect(page.locator('.upd-banner')).toHaveCount(0)
    await expect.poll(async () => (await page.evaluate(() => window.aw.getPrefs())).seenVersion).toBe(version)
  } finally {
    await app.close()
  }
})

test('the packed app says nothing of an update after a downgrade (a newer version was remembered), and remembers the one it runs', async () => {
  test.skip(!process.env.PACKED_APP, 'set PACKED_APP to the executable of a packed app')
  const { app, page } = await packed(process.env.PACKED_APP!, { seenVersion: '99.0.0' })
  try {
    const { version } = await page.evaluate(() => window.aw.appInfo())
    await expect.poll(async () => (await page.evaluate(() => window.aw.getPrefs())).seenVersion).toBe(version)
    await expect(page.locator('.upd-banner')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test("a packed app whose bundled changelog has no section for its version says there are no notes", async () => {
  test.skip(!process.env.PACKED_APP, 'set PACKED_APP to the executable of a packed app')
  // A clone of the app (APFS copy-on-write, so it costs nothing), with the changelog it carries replaced: a packed app cannot change its own version.
  const bundle = resolve(dirname(process.env.PACKED_APP!), '..', '..')
  const copy = join(realpathSync(mkdtempSync(join(tmpdir(), 'aw-packed-copy-'))), 'Agent World.app')
  execFileSync('/bin/cp', ['-cR', bundle, copy])
  writeFileSync(join(copy, 'Contents', 'Resources', 'CHANGELOG.md'), '# Changelog\n\n## [0.0.1] - 2020-01-01\n\n- Something old.\n')
  const { app, page } = await packed(join(copy, 'Contents', 'MacOS', 'Agent World'))
  try {
    const dialog = await whatsNew(page)
    await expect(dialog).toContainText("This build's changelog has no notes for")
    await expect(dialog.getByRole('region', { name: /Notes of/ })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

