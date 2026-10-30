import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const REVIEW = { version: 1, id: 'security-review', name: 'Security review', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'work', name: 'Review' }, { id: 'land', kind: 'merge' }] }

test('Import lists the other workspaces with their workflows and copies one into this project, or for everything', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-import-')))
  const shop = join(tmp, 'shop')
  const billing = join(tmp, 'billing')
  const scratch = join(tmp, 'scratch')
  for (const d of [shop, billing, scratch]) mkdirSync(d)
  mkdirSync(join(billing, '.agent-world', 'workflows'), { recursive: true })
  const source = join(billing, '.agent-world', 'workflows', 'security-review.json')
  writeFileSync(source, JSON.stringify(REVIEW))
  const home = join(tmp, 'home')
  mkdirSync(home)
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: {} } }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: shop, recent: [shop, billing, scratch] }))
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_CHAT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), shop)
    await page.reload()
    await page.locator('header').getByRole('button', { name: /Workflows/ }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()

    await win.getByRole('button', { name: 'Import…' }).click()
    const pick = win.getByRole('dialog', { name: 'Import a workflow' })
    // The other workspaces are listed, each with what it keeps itself; this one is not.
    await expect(pick).toContainText('billing')
    await expect(pick).toContainText('scratch')
    await expect(pick).toContainText('none of its own')
    await expect(pick).not.toContainText('shop')
    await expect(pick.getByRole('button', { name: /Security review/ })).toContainText('Build · Review · land')

    await pick.getByRole('button', { name: /Security review/ }).click()
    // It is now this project's own file, shown in the list, and the original is untouched.
    await expect(pick).toHaveCount(0)
    const mine = join(shop, '.agent-world', 'workflows', 'security-review.json')
    await expect.poll(() => existsSync(mine)).toBe(true)
    expect(JSON.parse(readFileSync(mine, 'utf8'))).toEqual(REVIEW)
    expect(JSON.parse(readFileSync(source, 'utf8'))).toEqual(REVIEW)
    await expect(win.getByRole('option', { name: /Security review/ })).toContainText('This project')

    // Again, for everything: the id is free there, so it keeps its name.
    await win.getByRole('button', { name: 'Import…' }).click()
    await pick.getByRole('button', { name: 'Everything' }).click()
    await pick.getByRole('button', { name: /Security review/ }).click()
    await expect.poll(() => existsSync(join(home, 'workflows', 'security-review.json'))).toBe(true)
  } finally {
    await shutdown()
  }
})
