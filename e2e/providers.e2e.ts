import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const fake = resolve(__dirname, 'fake-claude.mjs')
const fakeAgy = resolve(__dirname, 'fake-agy.mjs')
const open = (home: string, env: Record<string, string> = {}) => launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fake, AW_NO_SETUP: '', FAKE_DELAY_MS: '50', ...env }, home)
const toStep = async (page: import('@playwright/test').Page) => {
  const setup = page.getByRole('dialog', { name: 'First-run setup' })
  await setup.getByRole('button', { name: 'Continue' }).click()
  return setup
}

test('an installer terminal is tall enough to read, and the program in it is told the size that is shown', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-prov-size-'))
  const { app, shutdown } = await open(home, { AW_CLAUDE_BIN: join(home, 'no-such-claude'), AW_INSTALL_COMMAND: 'sleep 2; stty size; sleep 300' })
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 950 })
    const setup = await toStep(page)
    const claude = setup.locator('[data-provider="claude"]')
    await claude.getByRole('button', { name: 'Install Claude Code' }).click()
    const rows = claude.locator('.xterm-rows > div')
    await expect.poll(() => rows.count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(22)
    const shown = await rows.count()
    // `stty size` prints "rows columns" as the program sees them.
    await expect(claude.locator('.xterm-rows')).toContainText(new RegExp(`\\b${shown} \\d+\\b`), { timeout: 15_000 })
    const box = await claude.locator('.su-term').boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(380)
    expect(box!.width).toBeGreaterThanOrEqual(600)
  } finally {
    await shutdown()
  }
})

test('a card that is being set up lists its steps, says which one it is on, and only one terminal is open at a time', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-prov-steps-'))
  const signedIn = join(home, 'signed-in')
  const { app, shutdown } = await open(home, { FAKE_SIGNED_OUT: '1', AW_AGY_BIN: join(home, 'no-such-agy'), AW_INSTALL_COMMAND: 'echo installing; sleep 300', FAKE_SIGNED_OUT_FILE: signedIn })
  try {
    const page = await app.firstWindow()
    const setup = await toStep(page)
    const agy = setup.locator('[data-provider="agy"]')
    const claude = setup.locator('[data-provider="claude"]')
    // Not installed: step 1 is the one to do.
    const steps = agy.getByRole('list', { name: 'Steps' })
    await expect(steps.getByRole('listitem')).toHaveText([/Install/, /Sign in/, /Ready/])
    await expect(steps.locator('[aria-current="step"]')).toContainText('Install')
    // Signed out claude: install is done, sign in is the step, with what to do in it.
    const csteps = claude.getByRole('list', { name: 'Steps' })
    await expect(csteps.locator('[aria-current="step"]')).toContainText('Sign in')
    await expect(csteps.locator('[data-done="true"]')).toContainText('Install')
    await claude.getByRole('button', { name: 'Open a terminal to sign in' }).click()
    await expect(claude.locator('.su-term')).toBeVisible()
    await expect(csteps).toContainText('paste it in the terminal')
    // Starting another card's terminal puts the first one away.
    await agy.getByRole('button', { name: /Install agy/ }).click()
    await expect(agy.locator('.su-term')).toBeVisible()
    await expect(claude.locator('.su-term')).toHaveCount(0)
    await expect(setup.locator('.su-term')).toHaveCount(1)
  } finally {
    await shutdown()
  }
})

test('a Claude Code that has just been installed says what comes next, including the trust question', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-prov-claude-'))
  const target = join(home, 'bin-claude')
  const { app, shutdown } = await open(home, { AW_CLAUDE_BIN: target, FAKE_SIGNED_OUT: '1', AW_INSTALL_COMMAND: `cp "${fake}" "${target}" && chmod +x "${target}"; sleep 300` })
  try {
    const page = await app.firstWindow()
    const setup = await toStep(page)
    const claude = setup.locator('[data-provider="claude"]')
    await claude.getByRole('button', { name: 'Install Claude Code' }).click()
    await expect(claude).toContainText('Installed · next: sign in', { timeout: 20_000 })
    await expect(claude).toContainText('Yes, I trust this folder')
    await expect(claude.locator('.su-term')).toHaveCount(0)
    await expect(claude.getByRole('button', { name: 'Open a terminal to sign in' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

const repo = (home: string) => {
  const dir = join(home, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  return dir
}

test('the hire form lists agy even when it is not set up: greyed, not pickable, with a way to set it up from there', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aw-prov-hire-')))
  const dir = repo(home)
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'h'), AW_CLAUDE_BIN: fake, AW_AGY_BIN: join(home, 'no-such-agy'), AW_INSTALL_COMMAND: 'echo setting up agy; sleep 300', FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    const tile = form.locator('.hire-opt', { hasText: 'agy' })
    await expect(tile).toBeVisible()
    await expect(tile).toContainText('not installed')
    await expect(tile.getByRole('radio')).toBeDisabled()
    await expect(form.locator('.hire-opt', { hasText: 'Claude Code' }).getByRole('radio')).toBeChecked()
    await form.getByRole('button', { name: 'Set up agy' }).click()
    // The same install terminal as in Setup, on agy's card.
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await expect(setup.locator('[data-provider="agy"] .su-term')).toBeVisible({ timeout: 10_000 })
    await expect(setup.locator('[data-provider="agy"] .xterm-rows')).toContainText('setting up agy', { timeout: 10_000 })
  } finally {
    await shutdown()
  }
})

test('Settings, Providers shows each provider as the same card as setup, with its version and where it was found, and the same actions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-prov-settings-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fake, AW_AGY_BIN: join(home, 'no-such-agy'), AW_INSTALL_COMMAND: 'echo installing agy; sleep 300', FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Providers' }).click()
    const claude = settings.locator('[data-provider="claude"]')
    await expect(claude).toContainText('Ready')
    await expect(claude).toContainText('v2.1.289')
    await expect(claude).toContainText('fake-claude.mjs')
    const agy = settings.locator('[data-provider="agy"]')
    await expect(agy).toContainText('Not installed')
    await agy.getByRole('button', { name: /Install agy/ }).click()
    await expect(agy.locator('.xterm-rows')).toContainText('installing agy', { timeout: 10_000 })
    await expect(settings.getByRole('button', { name: 'Re-scan' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('a code copied from a web page can be pasted into the terminal with the paste key, and it is shown as it is typed', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-prov-paste-'))
  const { app, shutdown } = await open(home, { AW_CLAUDE_BIN: join(home, 'no-such-claude'), AW_INSTALL_COMMAND: "echo 'Open https://example.com/auth?code=abc and paste the code:'; read -r x; echo GOT:$x; sleep 300" })
  try {
    const page = await app.firstWindow()
    const setup = await toStep(page)
    const claude = setup.locator('[data-provider="claude"]')
    await claude.getByRole('button', { name: 'Install Claude Code' }).click()
    await expect(claude.locator('.xterm-rows')).toContainText('paste the code', { timeout: 10_000 })
    await app.evaluate(({ clipboard }) => clipboard.writeText('4/0AbCdEf-secret-code'))
    await claude.locator('.xterm').click()
    await page.keyboard.press('Meta+V')
    await expect(claude.locator('.xterm-rows')).toContainText('4/0AbCdEf-secret-code', { timeout: 5000 })
    await page.keyboard.press('Enter')
    await expect(claude.locator('.xterm-rows')).toContainText('GOT:4/0AbCdEf-secret-code', { timeout: 5000 })
  } finally {
    await shutdown()
  }
})
