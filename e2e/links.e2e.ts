import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a local link in the chat opens in the Preview tab, ⌘/Ctrl-click opens the browser, and web links always do', async () => {
  const site = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<main><h1>Test site</h1><p id="where">${req.url}</p></main>`))
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r))
  const port = (site.address() as AddressInfo).port
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-links-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, `Open [the test site](http://127.0.0.1:${port}/docs/start) or read [the web](https://example.com/page).\n\nBare address: http://127.0.0.1:${port}/bare\n`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    // The browser is a stand-in: record what would have been opened instead of opening it.
    await app.evaluate(({ shell }) => {
      ;(globalThis as unknown as { opened: string[] }).opened = []
      shell.openExternal = async (u: string) => void (globalThis as unknown as { opened: string[] }).opened.push(u)
    })
    const opened = () => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    const local = log.getByRole('link', { name: 'the test site' })
    await expect(local).toBeVisible({ timeout: 15_000 })
    await expect(local).toHaveAttribute('title', /Preview tab/)

    // A plain click shows it in the Preview tab, at the address that was clicked.
    await local.click()
    await expect(page.getByRole('tab', { name: /Preview/, selected: true })).toBeVisible()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> } | null)?.executeJavaScript(c).catch(() => '') ?? '', code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('/docs/start')
    expect(await opened()).toEqual([])

    // ⌘-click or Ctrl-click opens the browser instead, and the Preview tab is left alone.
    await page.getByRole('tab', { name: 'Chat' }).click()
    await local.click({ modifiers: ['ControlOrMeta'] })
    await expect.poll(opened).toEqual([`http://127.0.0.1:${port}/docs/start`])
    await expect(page.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible()

    // An address on the internet is never loaded in the Preview tab.
    await log.getByRole('link', { name: 'the web' }).click()
    await expect.poll(opened).toEqual([`http://127.0.0.1:${port}/docs/start`, 'https://example.com/page'])
    await expect(page.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible()

    // A bare address in the text is a link too, and an address you typed yourself.
    await log.getByRole('link', { name: `http://127.0.0.1:${port}/bare` }).click()
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('/bare')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: /^Message/ })
    await box.fill(`and also http://127.0.0.1:${port}/mine.`)
    await box.press('Enter')
    const mine = log.locator('.msg.user .bubble a')
    await expect(mine).toHaveText(`http://127.0.0.1:${port}/mine`, { timeout: 10_000 })
    await mine.click()
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('/mine')
  } finally {
    await shutdown()
    site.close()
  }
})

test('a link to a server the Preview tab already shows opens that page in place, and the app stays up', async () => {
  const site = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<main><h1>Detected site</h1><p>${req.url}</p></main>`))
  await new Promise<void>((r) => site.listen(0, '127.0.0.1', r))
  const port = (site.address() as AddressInfo).port
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-links2-')))
  const dir = join(tmp, 'proj')
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  const doc = join(tmp, 'doc.md')
  writeFileSync(doc, `Your site is at [localhost](http://localhost:${port}/) and the details are at [this page](http://localhost:${port}/details).\n`)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_SAY_FILE: doc }, tmp)
  try {
    const page = await app.firstWindow()
    const crashes: string[] = []
    // The sandboxed preview page itself reports a localStorage denial as soon as it opens; the app's own errors are what matter here.
    page.on('pageerror', (e) => !/Access is denied for this document/.test(e.message) && crashes.push(e.message))
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), dir)
    await page.reload()
    await hire(page)
    // The agent's own server shows up in the Preview tab first, with its webview already on screen.
    await page.getByRole('tab', { name: /Preview/ }).click()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> } | null)?.executeJavaScript(c).catch(() => '') ?? '', code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('Detected site')
    await page.getByRole('tab', { name: 'Chat' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await log.getByRole('link', { name: 'this page' }).click()
    await expect(page.getByRole('tab', { name: /Preview/, selected: true })).toBeVisible()
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('/details')
    // Nothing blew up, and the app is still on screen.
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(crashes, crashes.join(' | ')).toEqual([])
    // Straight back from the Preview tab by clicking the same sort of link again, before it has settled.
    await page.getByRole('tab', { name: 'Chat' }).click()
    await log.getByRole('link', { name: 'localhost' }).click()
    await expect.poll(() => run('document.body.innerText'), { timeout: 15_000 }).toContain('Detected site')
    await expect(page.locator('header')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(crashes, crashes.join(' | ')).toEqual([])
  } finally {
    await shutdown()
    site.close()
  }
})
