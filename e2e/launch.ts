import { type Page, _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Tests run with no visible window, dock icon or notifications (AW_HIDDEN), so they never steal focus from what you are doing.
// Set AW_SHOW=1 to watch one: AW_SHOW=1 npx playwright test e2e/chat.e2e.ts
const hidden: Record<string, string> = process.env.AW_SHOW ? {} : { AW_HIDDEN: '1' }

// Every launch gets a guaranteed teardown: a main-process error dialog blocks a normal close,
// so we kill the process ourselves and always remove the test's temp dir.
export async function launchApp(env: Record<string, string>, tmp: string) {
  const app = await electron.launch({ args: [resolve(__dirname, '..')], env: { ...(process.env as Record<string, string>), ...hidden, ...env } })
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

/** Choose an item from the selected agent's "More actions" menu. */
export async function headMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Choose an item from the chat's "Conversation tools" menu. */
export async function chatMenu(page: Page, item: string | RegExp) {
  await page.getByRole('button', { name: 'Conversation tools' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}
