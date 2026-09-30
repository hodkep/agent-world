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
