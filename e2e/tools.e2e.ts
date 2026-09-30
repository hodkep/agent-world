import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the Tools tab lists MCP servers with their health and installed plugins', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-tools-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Tools' }).click()
    await expect(page.locator('.tools li.health-ok', { hasText: 'fake-docs' })).toContainText('Connected')
    await expect(page.locator('.tools li.health-failed', { hasText: 'fake-db' })).toContainText('Failed to connect')
    await expect(page.locator('.tools li', { hasText: 'fake-plugin@market' })).toContainText('enabled · user')
  } finally {
    await shutdown()
  }
})

test('servers can be added and removed, plugins toggled, through Claude\'s own commands', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-tools-'))
  const calls = join(home, 'calls.txt')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CALLS: calls }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Tools' }).click()
    await page.getByRole('button', { name: 'Add server' }).click()
    await page.getByLabel('Server name').fill('notes')
    await page.getByLabel('Address or command').fill('https://notes.example/mcp')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Done')
    await page.locator('.tools li', { hasText: 'fake-db' }).getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('button', { name: 'Sure?' }).click()
    await page.locator('.tools li', { hasText: 'fake-plugin@market' }).getByRole('button', { name: 'Disable' }).click()
    await expect.poll(() => readFileSync(calls, 'utf8').trim().split('\n')).toEqual([
      'mcp add --scope local --transport http notes https://notes.example/mcp',
      'mcp remove fake-db',
      'plugin disable fake-plugin@market'
    ])
  } finally {
    await shutdown()
  }
})

test('project memory: notes you add are listed, and can be forgotten', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-mem-'))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Tools' }).click()
    await page.getByLabel('Add a note').fill('Tests run with pnpm test')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const item = page.locator('.tools li', { hasText: 'Tests run with pnpm test' })
    await expect(item).toContainText('you')
    await item.getByRole('button', { name: /^Forget/ }).click()
    await expect(item).toHaveCount(0)
  } finally {
    await shutdown()
  }
})
