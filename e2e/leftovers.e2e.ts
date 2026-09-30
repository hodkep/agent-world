import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('the handbook book on the desk opens CLAUDE.md, and a clone sits beside its original', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-left-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    // The book lies on the desk of the first agent: find it through the desk's screen position.
    await expect.poll(async () => JSON.parse((await page.locator('.stage').getAttribute('data-books')) ?? '[]').length).toBe(1)
    const [book] = JSON.parse((await page.locator('.stage').getAttribute('data-books'))!) as { agentId: string; x: number; y: number }[]
    const box = (await page.locator('.stage').boundingBox())!
    await page.mouse.click(box.x + book!.x, box.y + book!.y)
    await expect(page.locator('.diff')).toContainText('Project notes')

    // Clone: the twin takes the nearest free desk.
    await page.getByRole('button', { name: 'Clone', exact: true }).click()
    await expect.poll(async () => JSON.parse((await page.locator('.stage').getAttribute('data-books')) ?? '[]').length).toBe(2)
    const books = JSON.parse((await page.locator('.stage').getAttribute('data-books'))!) as { agentId: string; x: number; y: number }[]
    const gap = Math.hypot(books[0]!.x - books[1]!.x, books[0]!.y - books[1]!.y)
    const view = JSON.parse((await page.locator('.stage').getAttribute('data-view'))!) as { scale: number }
    // Neighbouring desks in the same row are one desk pitch (4 tiles = 64 art px) apart; the first free desk would also be, so ask for adjacency.
    expect(gap / view.scale).toBeLessThanOrEqual(64.5)
  } finally {
    await shutdown()
  }
})
