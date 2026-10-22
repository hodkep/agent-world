import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')

async function start(env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aw-agyq-'))
  const agyHome = join(home, 'agy')
  mkdirSync(agyHome)
  const folder = join(home, 'project')
  mkdirSync(folder)
  const askLog = join(home, 'ask.log')
  const fileLog = join(home, 'file.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: agyHome, FAKE_DELAY_MS: '100', FAKE_ASK_LOG: askLog, FAKE_FILE_LOG: fileLog, ...env }, home)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
  await page.reload()
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
  await form.getByLabel('Name').fill('ada')
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
  const [ada] = await page.evaluate(() => window.aw.listAgents())
  return { page, shutdown, askLog, fileLog, ada: ada! }
}

test('a question agy asks with ask_question is a card in the chat, not raw JSON, and the answers are pressed into its box', async () => {
  const t = await start()
  try {
    // agy must be ready before it is told something.
    await expect.poll(() => t.page.evaluate((id) => window.aw.listAgents().then((as) => as.find((a) => a.id === id)?.activity), t.ada.id), { timeout: 20_000 }).toBe('idle')
    await t.page.evaluate((id) => window.aw.chatSend(id, 'please use ask_question now'), t.ada.id)
    const strip = t.page.locator('.ask-pill')
    await expect(strip).toContainText('question', { timeout: 20_000 })
    await strip.click()
    const dialog = t.page.locator('section.inline-need').first()
    await expect(dialog).toContainText('Where?')
    await dialog.getByRole('radio', { name: /B/ }).click()
    await expect(dialog).toContainText('Which channels?')
    await dialog.getByRole('checkbox', { name: /^X/ }).click()
    await dialog.getByRole('checkbox', { name: /^Z/ }).click()
    await dialog.getByRole('button', { name: 'Review' }).click()
    await dialog.getByRole('button', { name: 'Send answers' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })
    // What was pressed into the box: the single choice, then the two ticked answers.
    await expect.poll(() => read(t.askLog).trim(), { timeout: 15_000 }).toBe(JSON.stringify(['B', 'X, Z']))
    // In the conversation the call reads as the questions, not as the tool's JSON.
    await t.page.getByRole('tab', { name: 'Chat' }).click()
    await expect(t.page.getByRole('log', { name: 'Conversation with ada' })).toContainText('Asked 2 questions', { timeout: 15_000 })
    await expect(t.page.getByRole('log', { name: 'Conversation with ada' })).not.toContainText('is_multi_select')
  } finally {
    await t.shutdown()
  }
})

test('a question about a file outside the workspace shows the program\'s three answers as they are in the terminal, and the one chosen is pressed', async () => {
  const t = await start()
  try {
    await expect.poll(() => t.page.evaluate((id) => window.aw.listAgents().then((as) => as.find((a) => a.id === id)?.activity), t.ada.id), { timeout: 20_000 }).toBe('idle')
    await t.page.evaluate((id) => window.aw.chatSend(id, 'write a file outside the workspace'), t.ada.id)
    const card = t.page.locator('section.inline-need').first()
    await expect(card).toContainText('outside workspace', { timeout: 20_000 })
    // A new file is told as one: its kind, its path, and the line it would have.
    await expect(card.locator('.fa-tag').first()).toHaveText('NEW FILE')
    await expect(card.locator('.fa-path')).toHaveText('/private/tmp/x/x.txt')
    await expect(card.getByLabel('The change')).toContainText('hi')
    await expect(card.getByRole('button')).toContainText(['Yes, allow creation', 'Yes, and always allow non-workspace access', 'No, deny creation'].map((x) => x))
    // The second answer is two arrows away from nothing: it is reached, looked at, and only then pressed.
    await card.getByRole('button', { name: 'Yes, and always allow non-workspace access' }).click()
    await expect.poll(() => read(t.fileLog).trim(), { timeout: 15_000 }).toBe('2')
    await expect(card).toBeHidden({ timeout: 10_000 })
  } finally {
    await t.shutdown()
  }
})
