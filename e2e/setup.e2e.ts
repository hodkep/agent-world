import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const fake = resolve(__dirname, 'fake-claude.mjs')
const open = (home: string, bin: string) => launchApp({ AW_HOME: home, AW_CLAUDE_BIN: bin, AW_NO_SETUP: '', FAKE_DELAY_MS: '50' }, home)

test('a first run walks through setup, hires the first agent with the chosen defaults, and does not open again', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-'))
  const { app, shutdown } = await open(home, fake)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await expect(setup.getByRole('heading', { name: 'Welcome to Agent World' })).toBeVisible()
    await setup.getByRole('button', { name: 'Continue' }).click()

    await expect(setup.getByRole('heading', { name: 'Your agents' })).toBeVisible()
    const claude = setup.locator('[data-provider="claude"]')
    await expect(claude).toContainText('Claude Code')
    await expect(claude).toContainText('Ready')
    await expect(claude).toContainText('v2.1.289')
    await setup.getByRole('button', { name: 'Continue' }).click()

    await expect(setup.getByRole('heading', { name: 'Pick your project folder' })).toBeVisible()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await expect(setup.locator('.su-step.skipped')).toContainText('Project folder')
    await setup.getByRole('button', { name: 'Plan first' }).click()
    // Tracking every request as a todo is offered here with what it adds, and is off until chosen.
    const track = setup.getByRole('switch', { name: 'Track every request as a todo' })
    await expect(track).toHaveAttribute('aria-checked', 'false')
    await expect(setup.getByLabel('What fully tracked todos add, on these assumptions')).toContainText('tokens')
    await track.click()
    await expect(track).toHaveAttribute('aria-checked', 'true')
    await setup.getByRole('button', { name: 'Continue' }).click()

    // One feature for now: the check before acting. It is on, says what it costs on stated assumptions, and a click turns it off in the global playbook.
    await expect(setup.getByRole('heading', { name: 'Which features should agents use?' })).toBeVisible()
    const check = setup.getByRole('switch', { name: 'Check before acting' })
    await expect(check).toHaveAttribute('aria-checked', 'true')
    await expect(setup.getByRole('table', { name: 'What the check adds, on these assumptions' })).toContainText('≈ 2,750 tokens')
    await check.click()
    await expect(check).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'library', 'playbooks', 'global.json'), 'utf8'))).toMatchObject({ features: { forcedCheck: false } })
    await setup.getByRole('button', { name: 'Continue' }).click()

    await expect(setup.getByRole('heading', { name: 'Hire your first agent' })).toBeVisible()
    await setup.getByLabel('Name').fill('ada')
    await setup.getByRole('button', { name: 'Hire and finish' }).click()
    await expect(setup).toBeHidden()
    await expect(page.locator('.roster, header').getByText('ada').first()).toBeVisible()

    await expect.poll(() => JSON.parse(readFileSync(join(home, 'preferences.json'), 'utf8'))).toMatchObject({ setup: { done: true, defaultProvider: 'claude' }, defaults: { permissionMode: 'plan' }, todoTracking: 'full' })
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0]).toMatchObject({ name: 'ada', provider: 'claude', options: { permissionMode: 'plan', provider: 'claude' } })
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'First-run setup' })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('setup is one large fixed window: the same size on every step, inside a short app window, with Back and Continue always in view and the content of a step scrolling', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-size-'))
  const { app, shutdown } = await open(home, fake)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1100, height: 640 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    const win = setup.locator('.su-win')
    await expect(setup.getByRole('heading', { name: 'Welcome to Agent World' })).toBeVisible()
    const first = (await win.boundingBox())!
    expect(first.y).toBeGreaterThanOrEqual(0)
    expect(first.y + first.height).toBeLessThanOrEqual(640)
    // Every step is the same window, and its buttons are on screen without scrolling the page.
    for (const heading of ['Your agents', 'Pick your project folder', 'How much may they do alone?']) {
      await setup.getByRole('button', { name: 'Continue' }).click()
      await expect(setup.getByRole('heading', { name: heading })).toBeVisible()
      const box = (await win.boundingBox())!
      expect(box.height).toBeCloseTo(first.height, 0)
      expect(box.width).toBeCloseTo(first.width, 0)
      const next = (await setup.getByRole('button', { name: /Continue|Skip for now/ }).first().boundingBox())!
      expect(next.y + next.height).toBeLessThanOrEqual(box.y + box.height + 1)
    }
    // The defaults step is longer than the window: its content scrolls inside, and the footer stays.
    const content = setup.locator('.su-content')
    const scrolls = await content.evaluate((e) => ({ over: e.scrollHeight > e.clientHeight, style: getComputedStyle(e).overflowY }))
    expect(scrolls.style).toBe('auto')
    expect(scrolls.over).toBe(true)
    await content.evaluate((e) => (e.scrollTop = e.scrollHeight))
    await expect(setup.getByRole('button', { name: 'Back' })).toBeInViewport()
    await expect(setup.getByRole('button', { name: 'Continue' })).toBeInViewport()
    await expect(setup.getByLabel('What fully tracked todos add, on these assumptions')).toBeInViewport()
  } finally {
    await shutdown()
  }
})

test('with no agent tool on this computer, setup cannot be passed and says how to install one', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-none-'))
  const { app, shutdown } = await open(home, join(home, 'no-such-claude'))
  try {
    const page = await app.firstWindow()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await setup.getByRole('button', { name: 'Continue' }).click()
    const claude = setup.locator('[data-provider="claude"]')
    await expect(claude).toContainText('Not installed')
    await expect(setup.getByText('Install or sign in to one agent tool to continue.')).toBeVisible()
    await expect(setup.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await claude.getByRole('button', { name: 'How to install' }).click()
    await expect(claude.locator('.su-howto')).toContainText('claude.ai/install')
  } finally {
    await shutdown()
  }
})

test('setup can be run again from Settings and closed at any step', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-again-'))
  const { app, shutdown } = await open(home, fake)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await setup.getByRole('button', { name: 'Continue' }).click()
    await setup.getByRole('button', { name: 'Continue' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Hire and finish' }).click()
    await expect(setup).toBeHidden()

    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await expect(settings).toBeVisible()
    await settings.getByRole('tab', { name: /Setup/ }).click()
    await settings.getByRole('button', { name: 'Set up again' }).click()
    await expect(setup.getByRole('heading', { name: 'Welcome to Agent World' })).toBeVisible()
    await setup.getByRole('button', { name: 'Close' }).click()
    await expect(setup).toBeHidden()
  } finally {
    await shutdown()
  }
})

const fakeAgy = resolve(__dirname, 'fake-agy.mjs')

test('setup offers only Claude Code and agy', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-gemini-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fake, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: join(home, 'agy'), AW_AGY_CONFIG: join(home, 'mcp_config.json'), AW_NO_SETUP: '' }, home)
  try {
    const page = await app.firstWindow()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    // First run owns the screen: nothing behind it can be clicked or tabbed to.
    await expect(setup).toBeVisible()
    await expect(page.locator('.app > :not(.su-overlay)').first()).toHaveAttribute('inert', '')
    await setup.getByRole('button', { name: 'Continue' }).click()
    await expect(setup.getByText('Gemini')).toHaveCount(0)
    // agy is only usable with the message box, so setup does not go on until it is connected, and it is not optional.
    const next = setup.getByRole('button', { name: 'Continue' })
    await expect(next).toBeDisabled()
    await expect(setup).toContainText('Connect agy (Antigravity) to the message box to continue.')
    await setup.getByRole('button', { name: /Let agy .* message other agents/ }).click()
    await expect(setup.getByRole('button', { name: 'Not now' })).toHaveCount(0)
    await setup.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(setup.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    await expect(next).toBeEnabled()
    await next.click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await setup.getByRole('button', { name: 'Skip for now' }).click()
    await expect(setup.getByLabel('Provider').locator('option')).toHaveText(['Claude Code', 'agy (Antigravity)'])
  } finally {
    await shutdown()
  }
})

test('an agy that is installed but signed out can be signed in from setup, in a terminal right there', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-setup-signin-'))
  const signedIn = join(home, 'signed-in')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fake, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: join(home, 'agy'), FAKE_SIGNED_OUT_FILE: signedIn, AW_NO_SETUP: '' }, home)
  try {
    const page = await app.firstWindow()
    const setup = page.getByRole('dialog', { name: 'First-run setup' })
    await setup.getByRole('button', { name: 'Continue' }).click()
    const agy = setup.locator('[data-provider="agy"]')
    await expect(agy).toContainText('Needs sign-in')
    await agy.getByRole('button', { name: 'Open a terminal to sign in' }).click()
    // The terminal runs the provider's own program; the app only starts it.
    await expect(agy.locator('.xterm')).toBeVisible({ timeout: 10_000 })
    await expect(agy.locator('.xterm-rows')).toContainText('Antigravity CLI', { timeout: 10_000 })
    writeFileSync(signedIn, '')
    await agy.getByRole('button', { name: 'I have signed in: check again' }).click()
    await expect(agy).toContainText('Ready')
    await expect(agy.locator('.xterm')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
