import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { chatTab, launchApp } from './launch'

test('a Reviewer can be changed to no role: it relaunches on the same session without the read-only instruction', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-role-'))
  const project = join(home, 'project')
  mkdirSync(project, { recursive: true })
  const log = join(home, 'launches.jsonl')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_ARGS: log }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Role').selectOption({ label: 'Reviewer' })
    await form.getByRole('button', { name: 'Hire' }).click()
    await expect(page.locator('.job-tag')).toHaveText('Reviewer')
    await chatTab(page)

    const launches = () => readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as string[])
    await expect.poll(() => launches().length).toBe(1)
    expect(launches()[0]!.join(' ')).toMatch(/code reviewer/)

    await page.getByRole('button', { name: 'More actions' }).click()
    const menu = page.getByRole('menu', { name: 'More actions' })
    await expect(menu.getByRole('menuitem', { name: /Change role/ })).toBeEnabled({ timeout: 15_000 })
    await menu.getByRole('menuitem', { name: /Change role/ }).click()
    // The current role is marked, and picking it again does nothing.
    await expect(menu.getByRole('menuitemradio', { name: 'Reviewer' })).toHaveAttribute('aria-checked', 'true')
    await expect(menu.getByRole('menuitemradio', { name: /No role/ })).toHaveAttribute('aria-checked', 'false')
    await menu.getByRole('menuitemradio', { name: 'Reviewer' }).click()
    await page.waitForTimeout(1500)
    expect(launches().length).toBe(1)
    await page.getByRole('button', { name: 'More actions' }).click()
    await menu.getByRole('menuitem', { name: /Change role/ }).click()
    await menu.getByRole('menuitemradio', { name: /No role/ }).click()

    await expect.poll(() => launches().length, { timeout: 20_000 }).toBe(2)
    const [first, again] = launches()
    expect(again!.join(' ')).not.toMatch(/code reviewer|read-only/i)
    expect(again).not.toContain('--permission-mode')
    // Same conversation: the relaunch resumes the session the first launch started.
    expect(again![again!.indexOf('--resume') + 1]).toBe(first![first!.indexOf('--session-id') + 1])
    await expect(page.locator('.job-tag')).toHaveCount(0)
    const [rex] = await page.evaluate(() => window.aw.listAgents())
    expect(rex!.options?.role).toBeUndefined()
    await page.getByRole('button', { name: 'More actions' }).click()
    await menu.getByRole('menuitem', { name: /Change role/ }).click()
    await expect(menu.getByRole('menuitemradio', { name: /No role/ })).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
    await expect(menu.getByRole('menuitemradio', { name: 'Reviewer' })).toHaveAttribute('aria-checked', 'false')
  } finally {
    await shutdown()
  }
})
