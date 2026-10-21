import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('code: an agent in a folder that is not a git repository shows the folder\'s files, with no Changes tab and no Commit or Merge to fail, and can open and save them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-inplace-'))
  const proj = join(home, 'proj')
  mkdirSync(join(proj, 'sub'), { recursive: true })
  mkdirSync(join(proj, 'node_modules', 'x'), { recursive: true })
  writeFileSync(join(proj, 'a.txt'), 'hello\n')
  writeFileSync(join(proj, 'sub', 'b.md'), '# b\n')
  writeFileSync(join(proj, 'node_modules', 'x', 'i.js'), 'x')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), proj)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Code' }).click()
    const note = page.getByRole('note', { name: 'No git worktree' })
    await expect(note).toContainText('works directly in this folder')
    await expect(note).toContainText('not a git repository')
    // The files of the folder, as in a repository; what nobody edits by hand is left out.
    const tree = page.getByRole('tree')
    await expect(tree.locator('button[title="a.txt"]')).toBeVisible()
    await expect(tree.locator('button[title="sub"]')).toBeVisible()
    await expect(tree.locator('button[title="node_modules"]')).toHaveCount(0)
    await tree.locator('button[title="sub"]').click()
    await expect(tree.locator('button[title="sub/b.md"]')).toBeVisible()
    // No change tracking: no Changes tab, no Commit, no Merge.
    await expect(page.getByRole('tab', { name: 'Changes' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Merge into base/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Commit all' })).toHaveCount(0)
    // A file opens in a tab, and a save goes to the folder.
    await tree.locator('button[title="a.txt"]').click()
    await expect(page.getByRole('tablist', { name: 'Open files' }).getByRole('tab', { name: /a\.txt/ })).toBeVisible()
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    await page.evaluate(([id]) => window.aw.code.write(id!, 'a.txt', 'saved\n'), [ada!.id])
    expect(readFileSync(join(proj, 'a.txt'), 'utf8')).toBe('saved\n')
    expect(await page.evaluate(([id]) => window.aw.code.read(id!, 'sub/b.md'), [ada!.id])).toBe('# b\n')
  } finally {
    await shutdown()
  }
})
