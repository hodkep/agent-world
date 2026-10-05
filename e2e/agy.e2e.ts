import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const fakeClaude = resolve(__dirname, 'fake-claude.mjs')
const fakeAgy = resolve(__dirname, 'fake-agy.mjs')

async function open(prefix: string) {
  const home = mkdtempSync(join(tmpdir(), prefix))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, FAKE_DELAY_MS: '600' }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
  await page.reload()
  return { page, shutdown, home }
}

async function hireAgy(page: import('@playwright/test').Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByLabel('Provider').selectOption('agy')
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

test('an agy agent is hired beside Claude, shows its provider, and its conversation reaches the chat', async () => {
  const { page, shutdown, home } = await open('aw-agy-')
  try {
    await hireAgy(page, 'ada')
    await expect(page.locator('.agent-row', { hasText: 'ada' }).locator('.ptag')).toHaveText('agy (Antigravity)')
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0]).toMatchObject({ name: 'ada', provider: 'agy' })

    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('hello there')
    await box.press('Enter')
    await expect(page.locator('.chat').getByText('echo: hello there')).toBeVisible({ timeout: 15_000 })
    // The conversation the app now resumes by is the one agy named, not the id the app made up.
    await expect.poll(() => JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0].sessionId).toMatch(/^[0-9a-f-]{36}$/)
    const history = readFileSync(join(home, 'agy', 'history.jsonl'), 'utf8')
    const conv = JSON.parse(history.trim().split('\n')[0]!).conversationId
    expect(JSON.parse(readFileSync(join(home, 'agents.json'), 'utf8'))[0].sessionId).toBe(conv)
  } finally {
    await shutdown()
  }
})

test('a permission agy asks for shows as a card in the office, and allowing it carries on', async () => {
  const { page, shutdown } = await open('aw-agy-perm-')
  try {
    await hireAgy(page, 'ada')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /message/i }).first()
    await box.fill('ask permission please')
    await box.press('Enter')
    const ask = page.getByRole('region', { name: 'ada is waiting for you' })
    await expect(ask).toContainText('touch note.txt', { timeout: 15_000 })
    await ask.getByRole('button', { name: 'Allow' }).click()
    await expect(ask).toHaveCount(0, { timeout: 10_000 })
    // Allowing pressed "Yes, run command" in agy's own menu, so it ran and finished its turn.
    await expect(page.locator('.agent-row', { hasText: 'ada' })).toHaveClass(/is-idle/, { timeout: 15_000 })
  } finally {
    await shutdown()
  }
})

test('Usage opens on one summary across providers, and a provider row opens its own limits', async () => {
  const { page, shutdown } = await open('aw-agy-usage-')
  try {
    await page.locator('header').getByRole('button', { name: 'Usage', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Usage and estimated costs' })
    // The busiest limit is the one with least left, whichever provider it belongs to.
    await expect(modal.locator('.st-card', { hasText: 'Busiest limit' })).toContainText('73% left')
    await expect(modal.locator('.st-card', { hasText: 'Busiest limit' })).toContainText('Gemini Models')
    await expect(modal.getByRole('button', { name: 'Open agy (Antigravity)' })).toContainText('73%')
    await expect(modal.getByRole('button', { name: 'Open Claude Code' })).toBeVisible()
    await modal.getByRole('button', { name: 'Open agy (Antigravity)' }).click()
    await expect(modal.getByText('Gemini Models', { exact: true })).toBeVisible()
    await expect(modal.getByText('Claude and GPT models', { exact: true })).toBeVisible()
    await expect(modal.getByText('73% left', { exact: false }).first()).toBeVisible()
    await expect(modal.getByText(/no price/)).toBeVisible()
    await modal.getByRole('button', { name: '‹ All providers' }).click()
    await expect(modal.getByRole('button', { name: 'Open agy (Antigravity)' })).toBeVisible()
  } finally {
    await shutdown()
  }
})
