import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// The voice companion, end to end, against a scripted Gemini (AW_VOICE_FAKE) and Chromium's fake microphone: no key, no network, no person.
async function open() {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-voice-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const home = join(tmp, 'home')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_VOICE_FAKE: '1' }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 900 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  return { page, shutdown, home, dir }
}
const settings = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Settings' })
const hold = async (page: import("@playwright/test").Page, ms = 1500) => {
  const b = page.getByRole('button', { name: /^Microphone/ })
  await b.hover()
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('setting up: a bad key is refused with a reason, a good one is tested, stamped and kept, and the switch turns the voice on', async () => {
  const { page, shutdown, home } = await open()
  try {
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    await settings(page).getByRole('tab', { name: /Voice \(beta\)/ }).click()
    const s = settings(page)
    await expect(s.getByRole('button', { name: 'Save and test' })).toBeDisabled()
    await expect(s.getByRole('switch').first()).toBeDisabled()
    await s.getByLabel('Gemini API key').fill('bad')
    await s.getByRole('button', { name: 'Save and test' }).click()
    await expect(s.getByRole('alert').filter({ hasText: 'did not accept' })).toBeVisible()
    expect(existsSync(join(home, 'voice-key.bin'))).toBe(false)
    await s.getByLabel('Gemini API key').fill('AIzaGoodKey1234567890abcdef')
    await s.getByRole('button', { name: 'Try again' }).click()
    await expect(s.getByRole('img', { name: 'Saved' })).toBeVisible({ timeout: 10_000 })
    await expect(s.getByTestId('voice-key-saved')).toBeVisible({ timeout: 10_000 })
    await expect(s.getByTestId('voice-key-saved')).toContainText('AIza••••••••cdef')
    expect(readFileSync(join(home, 'voice-key.bin')).toString('latin1')).not.toContain('AIzaGoodKey')
    await s.getByRole('switch').first().click()
    await expect(s.getByRole('switch').first()).toBeChecked()
    await s.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.locator('header').getByRole('button', { name: 'Start the voice companion' })).toBeVisible()
  } finally {
    await shutdown()
  }
})

async function setUp(page: import('@playwright/test').Page) {
  await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
  await settings(page).getByRole('tab', { name: /Voice \(beta\)/ }).click()
  await settings(page).getByLabel('Gemini API key').fill('AIzaGoodKey1234567890abcdef')
  await settings(page).getByRole('button', { name: 'Save and test' }).click()
  await expect(settings(page).getByTestId('voice-key-saved')).toBeVisible({ timeout: 10_000 })
  await settings(page).getByRole('switch').first().click()
  await expect(settings(page).getByRole('switch').first()).toBeChecked()
  await settings(page).getByRole('button', { name: 'Close settings' }).click()
}

test('a talk over the office: a slim strip on the message box, hold to talk, the voice looks at the agents with a tool, passes a request on to ada at once, and the talk is remembered', async () => {
  const { page, shutdown } = await open()
  try {
    await setUp(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    // The chimes are short oscillator notes: counting them tells that the start and the end each played (hearing them is up to a person).
    await page.evaluate(() => {
      const w = window as unknown as { __osc: number }
      w.__osc = 0
      const make = AudioContext.prototype.createOscillator
      AudioContext.prototype.createOscillator = function (this: AudioContext) {
        w.__osc++
        return make.call(this)
      }
    })
    await page.locator('header').getByRole('button', { name: 'Start the voice companion' }).click()
    const dock = page.getByRole('region', { name: 'Voice companion' })
    await expect(dock).toBeVisible()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __osc: number }).__osc)).toBe(2)
    // With the office showing it is a slim strip on top of the message box, in the chat panel; it has two buttons and no text.
    await expect(page.locator('aside').getByRole('region', { name: 'Voice companion' })).toBeVisible()
    const box = await dock.boundingBox()
    const composer = await page.locator('aside .composer').first().boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(composer!.y + 2)
    expect(box!.height).toBeLessThan(90)
    await expect(dock.getByRole('button')).toHaveCount(2)
    await expect(dock.getByRole('button', { name: 'End the call' })).toBeVisible()
    await expect(dock).toHaveAttribute('data-mic', 'off')
    await hold(page)
    await expect(dock).toContainText('Right now: ada is', { timeout: 15_000 })
    // The state reaches the page (the orb and the word follow it): it was speaking and is listening again.
    await expect(dock).toHaveAttribute('data-state', 'listening', { timeout: 15_000 })
    // A tap on the microphone leaves it on (hands-free), another turns it off again; holding is push to talk.
    await page.getByRole('button', { name: /^Microphone/ }).click()
    await expect(dock).toHaveAttribute('data-mic', 'hands-free')
    await page.getByRole('button', { name: /^Microphone/ }).click()
    await expect(dock).toHaveAttribute('data-mic', 'off')
    await hold(page)
    // The request is passed on at once, as the person, with no draft to press Send on.
    await page.getByRole('tab', { name: 'Chat' }).click().catch(() => undefined)
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').getByText('Add discount codes to the cart.')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('group', { name: 'Draft from the voice companion' })).toHaveCount(0)
    // ada finishes its turn, and the voice says so at a pause: news from the agents reaches the talk.
    await expect(dock).toContainText('Heads up: Agent ada:', { timeout: 25_000 })
    // The voice reads the numbers of the app when asked: here, what was spent today.
    await hold(page)
    await expect(dock).toContainText("Today's spend is", { timeout: 25_000 })
    // Drop the call.
    await dock.getByRole('button', { name: 'End the call' }).click()
    await expect(dock).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __osc: number }).__osc)).toBe(4)
    // The talk is kept with a summary, and Settings lists it.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    await settings(page).getByRole('tab', { name: /Voice \(beta\)/ }).click()
    // The summary is the last turns of the talk (which ones depends on timing), as Person and Voice lines.
    await expect(settings(page).getByText(/Person: |Voice: /).first()).toBeVisible({ timeout: 10_000 })
    await settings(page).getByRole('button', { name: 'Delete' }).first().click()
    await expect(settings(page).getByText('Nothing yet.')).toBeVisible()
  } finally {
    await shutdown()
  }
})

test('with the office hidden the call tile is in the same corner, and the end button drops the call', async () => {
  const { page, shutdown } = await open()
  try {
    await setUp(page)
    await page.keyboard.press('ControlOrMeta+Alt+o')
    await expect(page.locator('aside.solo')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Alt+v')
    const tile = page.getByRole('region', { name: 'Voice companion' })
    await expect(tile).toBeVisible()
    const box = await tile.boundingBox()
    expect(box!.x + box!.width).toBeGreaterThan(1500 - 100)
    expect(box!.y).toBeLessThan(160)
    await tile.getByRole('button', { name: 'End the call' }).click()
    await expect(tile).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('when the person chose to confirm first, the request waits as a draft until Send', async () => {
  const { page, shutdown } = await open()
  try {
    await setUp(page)
    await page.evaluate(async () => { const p = await window.aw.getPrefs(); await window.aw.setPrefs({ ...p, voice: { ...p.voice, confirm: true } }) })
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.locator('header').getByRole('button', { name: 'Start the voice companion' }).click()
    const dock = page.getByRole('region', { name: 'Voice companion' })
    await expect(dock).toBeVisible()
    await hold(page)
    await expect(dock).toHaveAttribute('data-state', 'listening', { timeout: 20_000 })
    await hold(page)
    const draft = page.getByRole('group', { name: 'Draft from the voice companion' })
    await expect(draft).toContainText('DRAFT FOR ADA', { timeout: 20_000 })
    await page.getByRole('tab', { name: 'Chat' }).click().catch(() => undefined)
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).getByText('Add discount codes to the cart.')).toHaveCount(0)
    await draft.getByRole('button', { name: 'Send' }).click()
    await expect(draft).toHaveCount(0)
    await expect(page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').getByText('Add discount codes to the cart.')).toBeVisible({ timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('a talk that cannot start says why on screen and takes you to the setting, instead of doing nothing', async () => {
  const { page, shutdown } = await open()
  try {
    // Voice is on but no key is saved (the same face a key the keychain refused to give back has).
    await page.evaluate(async () => { const p = await window.aw.getPrefs(); await window.aw.setPrefs({ ...p, voice: { ...p.voice, enabled: true } }) })
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Start the voice companion' }).click()
    const alert = page.getByRole('alert').filter({ hasText: 'no Gemini key' })
    await expect(alert).toBeVisible()
    await expect(page.getByRole('region', { name: 'Voice companion' })).toHaveCount(0)
    await alert.getByRole('button', { name: 'Open voice settings' }).click()
    await expect(settings(page).getByRole('heading', { name: 'Voice (beta)' }).or(settings(page).getByText('Voice (beta)').first())).toBeVisible()
    await expect(settings(page).getByLabel('Gemini API key')).toBeVisible()
  } finally {
    await shutdown()
  }
})
