import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

async function chat(env: Record<string, string>) {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-crew-'))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_DELEGATE_MS: '300', ...env }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  await page.getByRole('tab', { name: 'Chat' }).click()
  return { page, shutdown }
}

test('a line for subagents sits beside the commands line, and opens every subagent of this agent', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_HOLD: '1', FAKE_DELEGATE_NEST: '1', FAKE_CHILD: '1' })
  try {
    const commands = page.getByRole('button', { name: '1 command running' })
    const crew = page.getByRole('button', { name: /subagents? working/ })
    await expect(commands).toBeVisible({ timeout: 15_000 })
    await expect(crew).toBeVisible({ timeout: 15_000 })
    // One row of status chips: both buttons share a parent.
    const row = page.locator('.statusrow')
    await expect(row.getByRole('button')).toHaveCount(2)
    await crew.click()
    const panel = page.getByRole('dialog', { name: 'Subagents' })
    await expect(panel).toContainText('of 20 at once')
    // Three the main agent started, and the one the first of them started under it.
    const rows = panel.locator('.dg-row')
    await expect(rows).toHaveCount(4)
    await expect(panel.locator('.dg-row[data-level="1"]')).toContainText('Nested helper')
    await expect(rows.first()).toContainText('background')
    // What it can do to a working one: ask the main agent to stop it.
    await panel.locator('.dg-row.s-working').last().getByRole('button').first().click()
    await panel.getByRole('button', { name: /Ask ada to stop this one/ }).click()
    await expect(panel.getByRole('status')).toContainText('Asked ada to stop')
    // Interrupting stops them all, and says so.
    await panel.getByRole('button', { name: 'Interrupt all' }).click()
    await expect(panel.getByRole('status')).toContainText('Interrupted ada')
  } finally {
    await shutdown()
  }
})

test('a finished subagent can be followed up: it goes into the message box as a quote naming its id', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_HOLD: '1' })
  try {
    await page.getByRole('button', { name: /subagents? working/ }).click({ timeout: 20_000 })
    const panel = page.getByRole('dialog', { name: 'Subagents' })
    await expect(panel).toContainText('2 done', { timeout: 20_000 })
    await panel.locator('.dg-row.s-done').first().getByRole('button').first().click()
    await panel.getByRole('button', { name: 'Follow up' }).first().click()
    await expect(page.getByRole('list', { name: 'Quoted from the conversation' })).toContainText('agent id fake')
  } finally {
    await shutdown()
  }
})

test('the Subagents view in the header lists every agent that has subagents, with the same rows', async () => {
  const { page, shutdown } = await chat({ FAKE_DELEGATE: '3', FAKE_DELEGATE_HOLD: '1' })
  try {
    await page.locator('header').getByRole('button', { name: /^Subagents/ }).click()
    const view = page.getByRole('dialog', { name: 'Subagents' })
    await expect(view.getByRole('region', { name: 'Subagents of ada' })).toBeVisible({ timeout: 20_000 })
    await expect(view.locator('.dg-row')).toHaveCount(3)
    await expect(view).toContainText('working across 1 agent')
    await view.getByRole('button', { name: 'Open ada' }).click()
    await expect(view).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
