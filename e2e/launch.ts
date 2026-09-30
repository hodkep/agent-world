import { type Page, _electron as electron } from '@playwright/test'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

// Every launch gets a guaranteed teardown: a main-process error dialog blocks a normal close,
// so we kill the process ourselves and always remove the test's temp dir.
export async function launchApp(env: Record<string, string>, tmp: string) {
  const app = await electron.launch({ args: [resolve(__dirname, '..')], env: { ...(process.env as Record<string, string>), ...env } })
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
