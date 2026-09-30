import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('hire from a ready-made role, from a project agent file, save your own, or hire a starter crew', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-roles-'))
  const project = join(home, 'project')
  mkdirSync(join(project, '.claude', 'agents'), { recursive: true })
  writeFileSync(join(project, '.claude', 'agents', 'db.md'), '---\nname: db-migrator\ndescription: Writes database migrations\nmodel: sonnet\n---\nAlways add a rollback.')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()

    // A ready-made role fills in the settings for the job.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByLabel('Role').selectOption({ label: 'Reviewer' })
    await expect(form.getByLabel('Permissions')).toHaveValue('plan')
    await expect(form.getByLabel('Name')).toHaveValue('rex')
    await expect(form.getByLabel('Extra instructions')).toHaveValue(/code reviewer/)
    // The project's own Claude agent file is on offer too.
    await expect(form.getByLabel('Role').locator('optgroup[label="This project\'s agents"] option')).toHaveText('db-migrator')
    await form.getByRole('button', { name: 'Hire' }).click()
    await expect(page.locator('.agent-head .job-tag')).toHaveText('Reviewer')
    const [rex] = await page.evaluate(() => window.aw.listAgents())
    expect(rex!.options).toMatchObject({ permissionMode: 'plan', role: 'Reviewer' })

    // Keep your own settings as a role for next time.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const again = page.getByRole('form', { name: 'Hire an agent' })
    await again.getByLabel('Role').selectOption({ label: 'db-migrator' })
    await expect(again.getByLabel('Model')).toHaveValue('sonnet')
    await again.getByRole('button', { name: 'Save as role…' }).click()
    await again.getByLabel('Role name').fill('Migrator')
    await again.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(again.getByLabel('Role').locator('optgroup[label="Saved by you"] option')).toHaveText('Migrator')
  } finally {
    await shutdown()
  }
})

test('a starter crew of three is hired in one click', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-crew-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.getByRole('button', { name: /hire a starter crew/i }).click()
    await expect(page.locator('.roster button')).toHaveCount(3, { timeout: 15_000 })
    for (const n of ['scout', 'tess', 'rex']) await expect(page.locator('.roster')).toContainText(n)
  } finally {
    await shutdown()
  }
})
