import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('⌘K lists built-ins and project commands, and runs one in the agent between turns', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-pal-'))
  const project = join(home, 'project')
  mkdirSync(join(project, '.claude', 'commands'), { recursive: true })
  writeFileSync(join(project, '.claude', 'commands', 'ship.md'), '---\ndescription: Ship it to staging\n---\n')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await hire(page)
    await approve(page)
    await expect(page.locator('.roster button').first()).toContainText('idle', { timeout: 10_000 })

    await page.keyboard.press('ControlOrMeta+k')
    const palette = page.getByRole('dialog', { name: 'Commands for ada' })
    await expect(palette).toContainText('/compact')
    await palette.getByLabel('Command', { exact: true }).fill('ship')
    await expect(palette.getByRole('option').first()).toContainText('Ship it to staging')
    await expect(palette.getByRole('option').first()).toContainText('project command')

    await palette.getByLabel('Command', { exact: true }).fill('compact keep notes')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.term-host:visible')).toContainText('/compact keep notes')
  } finally {
    await shutdown()
  }
})
