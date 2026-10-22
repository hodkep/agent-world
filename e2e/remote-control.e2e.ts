import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, launchApp } from './launch'

async function start(extra: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aw-remote-'))
  const project = join(home, 'project')
  mkdirSync(project, { recursive: true })
  const log = join(home, 'launches.jsonl')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_ARGS: log, AW_CLAUDE_PROJECTS: join(home, 'projects'), ...extra }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
  await page.reload()
  const launches = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[])
  return { page, shutdown, launches, home }
}

async function hireRemote(page: import('@playwright/test').Page, name = 'ada') {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByLabel('Name').fill(name)
  await form.getByRole('switch', { name: /Remote control/ }).check({ force: true })
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
  await chatTab(page)
}

test('an agent hired with Remote control starts with the program\'s switch, shows its link as a tag and a code, and can be turned off from its menu', async () => {
  const { page, shutdown, launches } = await start()
  try {
    await hireRemote(page)
    await expect.poll(() => launches().length).toBe(1)
    expect(launches()[0]).toEqual(expect.arrayContaining(['--remote-control', 'ada']))

    // The program prints where it can be continued; the tag opens a panel with the code and the buttons.
    const tag = page.getByRole('button', { name: 'Remote', exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    // It sits in the agent's name row, beside its status, not over the chat's own controls.
    await expect(page.getByRole('region', { name: 'Selected agent' }).getByRole('button', { name: 'Remote', exact: true })).toBeVisible()
    await tag.click()
    const panel = page.getByRole('menu', { name: 'Remote control for ada' })
    await expect(panel.getByRole('img', { name: /Code to open this agent on a phone/ })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Copy phone link' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Open in browser' })).toBeVisible()
    await panel.getByRole('button', { name: 'Turn off remote control' }).click()

    // Switching restarts the agent on its own session, after saying so; Cancel is focused so Enter never restarts it.
    const confirm = page.getByRole('dialog', { name: 'Turn off remote control for ada?' })
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await confirm.getByRole('button', { name: /Turn off|Restart and turn off/ }).click()
    await expect.poll(() => launches().length).toBe(2)
    expect(launches()[1]).not.toContain('--remote-control')
    await expect(tag).toHaveCount(0)

    // And on again from the palette verbs.
    await page.keyboard.press('Meta+k')
    await page.getByRole('combobox', { name: 'Command' }).or(page.getByRole('textbox', { name: 'Command' })).fill('/remote')
    await expect(page.getByRole('option', { name: /remote-on/ })).toBeVisible()
    await expect(page.getByRole('option', { name: /remote-off/ })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('when the program refuses remote control the tag says not available and gives its reason', async () => {
  const { page, shutdown } = await start({ FAKE_REMOTE_REFUSE: 'Remote Control is not available for API key accounts.' })
  try {
    await hireRemote(page)
    const tag = page.getByText('Not available', { exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    await expect(tag).toHaveAttribute('title', 'Remote Control is not available for API key accounts.')
  } finally {
    await shutdown()
  }
})

test('an agent saved as not started whose conversation file exists is woken with --resume, not refused for reusing the session id', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-remote-'))
  const project = join(home, 'project')
  mkdirSync(project, { recursive: true })
  const log = join(home, 'launches.jsonl')
  const env = { AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_ARGS: log, AW_CLAUDE_PROJECTS: join(home, 'projects'), FAKE_TRANSCRIPT: '1', FAKE_SNAPSHOT: '1', FAKE_SESSION_LOCK: '1' }
  const open = async () => {
    const { app, shutdown } = await launchApp(env, home)
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    return { app, page, shutdown }
  }
  const launches = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[])
  const first = await open()
  try {
    await hireRemote(first.page)
    await expect.poll(() => launches().length).toBe(1)
    await first.app.close()
    // The app was closed before the conversation was marked started (as happened to a real agent), but Claude had saved its session.
    const file = join(home, 'aw', 'agents.json')
    const agents = JSON.parse(readFileSync(file, 'utf8')) as { started?: boolean }[]
    agents.forEach((a) => (a.started = false))
    writeFileSync(file, JSON.stringify(agents))
    const again = await open()
    try {
      // Opened again, it is asleep (its first launch was refused before the fix); Wake brings it back.
      const wake = again.page.getByRole('button', { name: /^Wake / })
      if (await wake.isVisible().catch(() => false)) await wake.click()
      await expect.poll(async () => (await again.page.evaluate(() => window.aw.listAgents()))[0]?.online, { timeout: 15_000 }).toBe(true)
      expect(launches().at(-1)).toContain('--resume')
    } finally {
      await again.shutdown()
    }
  } finally {
    await first.shutdown()
  }
})

test('the link stays known after the conversation has pushed it off the screen: the tag stays REMOTE, it does not fall back to STARTING', async () => {
  const { page, shutdown } = await start({ FAKE_REMOTE_ONCE: '1' })
  try {
    await hireRemote(page)
    const tag = page.getByRole('button', { name: 'Remote', exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    // Saying something redraws the terminal; the line that named the link is not on it any more.
    const box = page.getByRole('textbox', { name: /Message ada|message/i }).first()
    await box.fill('hello')
    await box.press('Enter')
    await expect(page.getByRole('log', { name: 'Conversation with ada' })).toContainText('hello', { timeout: 15_000 })
    await page.waitForTimeout(1500)
    await expect(tag).toBeVisible()
    await expect(page.getByText('Starting', { exact: true })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('the phone panel stays inside the agent column even when the tag is far to the right, and closes on a click outside or Esc', async () => {
  const { page, shutdown } = await start()
  try {
    await page.setViewportSize({ width: 1000, height: 800 })
    const name = 'a-very-long-agent'
    await hireRemote(page, name)
    const tag = page.getByRole('button', { name: 'Remote', exact: true })
    await expect(tag).toBeVisible({ timeout: 15_000 })
    await tag.click()
    const panel = page.getByRole('menu', { name: `Remote control for ${name}` })
    await expect(panel).toBeVisible()
    const fits = await page.evaluate(() => {
      const p = document.querySelector('.remote-panel')!.getBoundingClientRect()
      const col = document.querySelector('aside')!.getBoundingClientRect()
      return { left: p.left - col.left, right: col.right - p.right }
    })
    expect(fits.left).toBeGreaterThanOrEqual(0)
    expect(fits.right).toBeGreaterThanOrEqual(0)
    // A click anywhere outside closes it; so does Esc; the tag still toggles it.
    await page.getByRole('region', { name: 'Selected agent' }).getByLabel('Previous agent').click()
    await expect(panel).toHaveCount(0)
    await tag.click()
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await tag.click()
    await expect(panel).toBeVisible()
    await tag.click()
    await expect(panel).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
