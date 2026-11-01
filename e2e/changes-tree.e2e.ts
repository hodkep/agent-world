import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('changed files are a tree of folders by default, or one list with the file names first', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-changes-tree-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    const [agent] = await page.evaluate(() => window.aw.listAgents())
    const deep = join(agent!.cwd, 'backend', 'src', 'main', 'java', 'proposal')
    mkdirSync(deep, { recursive: true })
    mkdirSync(join(agent!.cwd, 'docs'))
    for (const f of ['ProposalDto.java', 'ProposalService.java']) writeFileSync(join(deep, f), 'class X {}\n')
    writeFileSync(join(agent!.cwd, 'docs', 'notes.md'), 'hi\n')
    await page.getByRole('tab', { name: 'Code' }).click()

    // A tree by default: folders that hold nothing else are joined into one row, and the file names are in full.
    const tree = page.locator('.change-list ul.tree')
    await expect(tree.getByRole('treeitem', { name: /backend\/src\/main\/java\/proposal/ })).toBeVisible()
    await expect(tree.getByRole('button', { name: /ProposalService\.java/ })).toBeVisible()
    await expect(tree.getByRole('treeitem', { name: /docs/ })).toBeVisible()
    if (process.env.AW_SHOTS) await page.locator('.change-list').screenshot({ path: `${process.env.AW_SHOTS}/changes-tree.png` })
    // A folder closes and opens, and opening a file still shows its change.
    await tree.getByRole('button', { name: /backend\/src\/main\/java\/proposal/ }).click()
    await expect(tree.getByRole('button', { name: /ProposalService\.java/ })).toHaveCount(0)
    await expect(tree.getByRole('button', { name: /notes\.md/ })).toBeVisible()
    await tree.getByRole('button', { name: /notes\.md/ }).click()
    await expect(page.locator('.diff')).toContainText('hi')

    // The list puts each file's name first, with its folder after it, and the choice is kept.
    await page.getByRole('button', { name: 'List', exact: true }).click()
    const row = page.locator('.change-list li', { hasText: 'ProposalService.java' })
    await expect(row.locator('.file .nm')).toHaveText('ProposalService.java')
    await expect(row.locator('.dir')).toHaveText('backend/src/main/java/proposal')
    if (process.env.AW_SHOTS) await page.locator('.change-list').screenshot({ path: `${process.env.AW_SHOTS}/changes-list.png` })
    await page.reload()
    await page.getByRole('tab', { name: 'Code' }).click()
    await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await shutdown()
  }
})
