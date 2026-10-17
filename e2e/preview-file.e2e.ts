import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

// A 1x1 picture, so the page can show it from beside itself.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function open(extra: Record<string, string> = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-prevfile-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const pages = join(tmp, 'scratch pad')
  mkdirSync(pages)
  writeFileSync(join(pages, 'a.png'), PNG)
  writeFileSync(join(pages, 'design.html'), '<!doctype html><h1 id="t">Design from a file</h1><img id="pic" src="a.png" alt="x">')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', ...extra }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1500, height: 950 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
  await page.reload()
  await hire(page)
  return { page, shutdown, pages, tmp }
}
const run = (page: import('@playwright/test').Page, code: string) =>
  page.evaluate(async (c) => {
      // A webview that is not in the page yet, or not ready (it throws at once, not as a failed promise), is no answer yet, so a poll asks again.
      try {
        return (await (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> } | null)?.executeJavaScript(c)) ?? ''
      } catch {
        return ''
      }
    }, code)

test('a path to a page, typed in the Preview bar, opens it with the pictures beside it, and the bar keeps the path', async () => {
  const { page, shutdown, pages } = await open()
  try {
    await page.getByRole('tab', { name: 'Preview' }).click()
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
    const typed = join(pages, 'design.html')
    await bar.fill(typed)
    await bar.press('Enter')
    await expect.poll(() => run(page, "document.getElementById('t') && document.getElementById('t').textContent"), { timeout: 15_000 }).toBe('Design from a file')
    // The picture next to the page loaded from the same folder.
    await expect.poll(() => run(page, "document.getElementById('pic').naturalWidth"), { timeout: 10_000 }).toBeGreaterThan(0)
    // The bar shows the path that was typed, not the temporary address it is served at.
    await expect(bar).toHaveValue(typed)
    await expect(bar).not.toHaveAttribute('aria-invalid', 'true')

    // A file: address, and one to nothing.
    await bar.fill(`file://${typed.replace(/ /g, '%20')}`)
    await bar.press('Enter')
    await expect.poll(() => run(page, "document.getElementById('t') && document.getElementById('t').textContent"), { timeout: 15_000 }).toBe('Design from a file')
    await bar.fill(join(pages, 'missing.html'))
    await bar.press('Enter')
    await expect(bar).toHaveAttribute('aria-invalid', 'true')
  } finally {
    await shutdown()
  }
})

test('a page an agent opens with a shell command is shown in its Preview tab, and Settings can turn that off', async () => {
  const tmp0 = realpathSync(mkdtempSync(join(tmpdir(), 'aw-openpage-')))
  const pageFile = join(tmp0, 'a page.html')
  writeFileSync(pageFile, '<!doctype html><h1 id="t">Opened by the agent</h1>')
  // `open` here is a stand-in word the parser knows; the fake agent only reports the command, nothing opens.
  const { page, shutdown } = await open({ FAKE_OPEN: `open "${pageFile}"` })
  try {
    await page.getByRole('tab', { name: 'Chat' }).click()
    await expect(page.getByRole('tab', { name: /Preview/, selected: true })).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => run(page, "document.getElementById('t') && document.getElementById('t').textContent"), { timeout: 15_000 }).toBe('Opened by the agent')
  } finally {
    await shutdown()
  }

  // Switched off, the same command leaves the tab alone.
  const off = await open({ FAKE_OPEN: `open "${pageFile}"` })
  try {
    await off.page.evaluate(async () => window.aw.setPrefs({ ...(await window.aw.getPrefs()), openPagesInApp: false }))
    await off.page.reload()
    await off.page.getByRole('tab', { name: 'Chat' }).click()
    await off.page.waitForTimeout(6000)
    await expect(off.page.getByRole('tab', { name: /Preview/, selected: true })).toHaveCount(0)
    await off.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = off.page.getByRole('dialog', { name: 'Settings' })
    await expect(dialog.getByLabel('Open pages in the app preview')).not.toBeChecked()
    await dialog.getByLabel('Open pages in the app preview').check()
    await expect.poll(() => off.page.evaluate(async () => (await window.aw.getPrefs()).openPagesInApp)).toBe(true)
  } finally {
    await off.shutdown()
  }
})
