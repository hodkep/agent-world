import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('a dev server an agent starts shows up in the Preview tab', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>hello from the dev server</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-prev-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port) }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await expect(page.getByRole('tab', { name: /Preview ●/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: /Preview/ }).click()
    await expect(page.locator('.preview-url')).toHaveText(`http://localhost:${port}/`)
    await expect(page.locator('.preview-state')).toHaveText('running')
    const text = () => page.evaluate(() => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<string> }).executeJavaScript('document.body.innerText'))
    await expect.poll(text, { timeout: 10_000 }).toContain('hello from the dev server')

    // The server stops: the tab says so.
    await new Promise<void>((r) => (dev.closeAllConnections(), dev.close(() => r())))
    await expect(page.locator('.preview-state')).toHaveText('not answering', { timeout: 10_000 })
  } finally {
    await shutdown()
    dev.close()
  }
})

test('selecting an element on the preview puts it in the message box as context', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<main><h1>Shop</h1><button id="cta" class="big">Sign up</button></main>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-pick-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> }).executeJavaScript(c), code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('Sign up')
    await page.getByRole('button', { name: 'Select element' }).click()
    await expect(page.getByRole('button', { name: 'Click an element…' })).toBeVisible()
    // Point at the button and click, as a person would.
    await run("const b = document.querySelector('#cta').getBoundingClientRect(); const at = { clientX: b.left + 5, clientY: b.top + 5, bubbles: true }; window.dispatchEvent(new MouseEvent('mousemove', at)); window.dispatchEvent(new MouseEvent('click', at))")
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await expect(box).toHaveValue(/Selector: .*button#cta/, { timeout: 10_000 })
    await expect(box).toHaveValue(/Text: "Sign up"/)
    await expect(box).toHaveValue(new RegExp(`Element picked from http://localhost:${port}/`))
    await expect(page.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible()
    await expect(page.locator('.attached, .chips, [class*="attach"]').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await shutdown()
    dev.close()
  }
})
