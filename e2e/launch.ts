import { type Page, _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Tests run with no visible window, dock icon or notifications (AW_HIDDEN), so they never steal focus from what you are doing.
// Set AW_SHOW=1 to watch one: AW_SHOW=1 npx playwright test e2e/chat.e2e.ts
const hidden: Record<string, string> = process.env.AW_SHOW ? {} : { AW_HIDDEN: '1' }

// Every launch gets a guaranteed teardown: a main-process error dialog blocks a normal close,
// so we kill the process ourselves and always remove the test's temp dir.
export async function launchApp(env: Record<string, string>, tmp: string) {
  const app = await electron.launch({ args: [resolve(__dirname, '..')], env: { ...(process.env as Record<string, string>), AW_ZOOM: '1', AW_NO_SETUP: '1', AW_AGY_BIN: '/no/such/agy', AW_GEMINI_BIN: '/no/such/gemini', ...hidden, ...env } })
  // The agent list starts folded away for real users; tests that are not about that keep it open, as most of them click rows in it.
  if (!env.AW_DEFAULT_LAYOUT) await app.context().addInitScript(() => localStorage.getItem('aw.compact') === null && localStorage.setItem('aw.compact', '0'))
  const proc = app.process()
  const shutdown = async () => {
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    rmSync(tmp, { recursive: true, force: true })
  }
  return { app, shutdown }
}

/** Open the hire form and hire with its defaults (or the given field values). */
export async function hire(page: Page, fields: { name?: string; model?: string; budget?: string; instructions?: string } = {}) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  if (fields.name) await form.getByLabel('Name').fill(fields.name)
  if (fields.model) await form.getByLabel('Model').selectOption(fields.model)
  if (fields.budget) await form.getByLabel('Budget (USD)').fill(fields.budget)
  if (fields.instructions) await form.getByLabel('Extra instructions').fill(fields.instructions)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
  // Most tests read the raw terminal; the chat view has its own tests.
  await page.getByRole('tab', { name: 'Terminal' }).click()
}

/** Open the box of the first agent waiting on you (if not already open) and allow its tool request. */
export async function approve(page: Page) {
  const dialog = page.getByRole('dialog')
  if (!(await dialog.isVisible())) await page.locator('.ask-pill').first().click({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Allow' }).click()
  await dialog.waitFor({ state: 'hidden' })
}

/** Show the selected agent's conversation, where its message box and controls live. */
export async function chatTab(page: Page) {
  await page.getByRole('tab', { name: 'Chat' }).click()
}

/** Choose an action from the "More actions" menu under the message box (Review and Clone open a second page). */
export async function headMenu(page: Page, item: string | RegExp) {
  await pickFromMenu(page, item)
  // Handing work to another agent or cloning is read in the raw terminal, so go back to it; Finish and Group open their own box.
  if (/Clone|review|reviewer/.test(String(item))) await page.getByRole('tab', { name: 'Terminal' }).click()
}

async function pickFromMenu(page: Page, item: string | RegExp) {
  await chatTab(page)
  await page.getByRole('button', { name: 'More actions' }).click()
  const menu = page.getByRole('menu', { name: 'More actions' })
  const name = String(item)
  const second = (tile: string, choice: string | RegExp) => menu.getByRole('menuitem', { name: tile }).click().then(() => menu.getByRole('menuitem', { name: choice }).click())
  if (/Clone\$|Clone/.test(name) && !/Clone as/.test(name)) return second('Clone', 'Same model')
  const clone = /Clone as (\w+)/.exec(name)
  if (clone) return second('Clone', clone[1]!)
  const ask = /Ask (\w+) to review/.exec(name)
  if (ask) return second('Review', `Ask ${ask[1]}`)
  if (/Hire a new reviewer/.test(name)) return second('Review', 'Hire a new reviewer')
  if (/Finish/.test(name)) return menu.getByRole('menuitem', { name: 'Finish this branch' }).click()
  if (/Group/.test(name)) return menu.getByRole('menuitem', { name: /Group/ }).click()
  return menu.getByRole('menuitem', { name: item }).click()
}

/** Choose an item from the chat's "Conversation tools" menu. */
export async function chatMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Conversation tools' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
