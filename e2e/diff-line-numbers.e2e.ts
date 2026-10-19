import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// A file of 1,200 lines, changed near its top and near line 1,000: both sides have four-digit numbers.
const LINES = (change: (n: number) => string) => Array.from({ length: 1200 }, (_, i) => change(i + 1)).join('\n') + '\n'
const plain = (n: number) => `export const line${n} = ${n}`

async function start() {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-gutter-'))
  const repo = join(tmp, 'shop-api')
  mkdirSync(join(repo, 'src'), { recursive: true })
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'src', 'big.ts'), LINES(plain))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  await hire(page)
  const [agent] = await page.evaluate(() => window.aw.listAgents())
  writeFileSync(join(agent!.cwd, 'src', 'big.ts'), LINES((n) => (n === 12 || n === 1000 ? `export const line${n} = ${n} * 2` : plain(n))))
  await page.getByRole('tab', { name: 'Code' }).click()
  await page.getByRole('tab', { name: 'Changes', exact: true }).click()
  await page.locator('.change-list ul').getByRole('button', { name: /big\.ts/ }).click()
  await expect(page.locator('.diff')).toContainText('line12 = 12 * 2')
  return { page, shutdown }
}

// The old side's numbers sit in a strip to the left of the editor; they are all there when the strip ends where the editor's own gutter begins, with no digit under it.
const geometry = (page: Page, shown: string) =>
  page.evaluate((text) => {
    const left = document.querySelector('.diff .editor.modified')!.getBoundingClientRect().left
    const cell = [...document.querySelectorAll('.diff .editor.original .line-numbers')].find((e) => (text === '4-digit' ? /^\d{4}$/.test((e as HTMLElement).innerText.trim()) : (e as HTMLElement).innerText.trim() === text)) as HTMLElement | undefined
    const box = cell?.getBoundingClientRect()
    // The widest the strip can show of a number is what lies between the strip's left edge and the editor, as drawn.
    const strip = document.querySelector('.diff .editor.original')!.getBoundingClientRect()
    return { found: !!cell, numberRight: box ? Math.round(box.right * 10) / 10 : null, editorLeft: Math.round(left * 10) / 10, stripLeft: Math.round(strip.left * 10) / 10 }
  }, shown)

test('the old-side line numbers are drawn in full, up to four digits, and no digit sits under the editor', async () => {
  const { page, shutdown } = await start()
  try {
    // Folded (the default): the numbers around the two changes, one of them four digits.
    await expect.poll(async () => (await geometry(page, '1000')).found, { timeout: 10_000 }).toBe(true)
    for (const n of ['12', '1000']) {
      const g = await geometry(page, n)
      expect(g.found, `line ${n} on the old side, folded`).toBe(true)
      expect(g.numberRight!, `old-side ${n} ends before the editor starts, folded`).toBeLessThanOrEqual(g.editorLeft + 0.5)
    }
    // Shown in full: every line is there, from the top to where the numbers have four digits.
    await page.getByRole('group', { name: 'Unchanged code' }).getByRole('button', { name: 'Show' }).click()
    await expect.poll(async () => (await geometry(page, '10')).found, { timeout: 10_000 }).toBe(true)
    for (const n of ['10', '12']) {
      const g = await geometry(page, n)
      expect(g.numberRight!, `old-side ${n} ends before the editor starts`).toBeLessThanOrEqual(g.editorLeft + 0.5)
    }
    await page.locator('.diff .editor.modified .view-line', { hasText: 'line5 = 5' }).first().click()
    for (let i = 0; i < 40; i++) await page.keyboard.press('PageDown')
    await expect.poll(async () => (await geometry(page, '4-digit')).found, { timeout: 10_000 }).toBe(true)
    const four = await geometry(page, '4-digit')
    expect(four.numberRight!, 'a four-digit old-side number ends before the editor starts').toBeLessThanOrEqual(four.editorLeft + 0.5)
  } finally {
    await shutdown()
  }
})
