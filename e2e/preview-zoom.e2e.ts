import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('in the Preview, Cmd+= / Cmd+- / Cmd+0 over the page zoom the page and not the app, and pinch is allowed on it', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>x</title><h1 id="h">Shop</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-dev-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port) }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> } | null)?.executeJavaScript(c), code)
    await expect.poll(() => run('!!document.getElementById("h")'), { timeout: 15_000 }).toBe(true)
    // What a key press does to the page's zoom and the app's, as the page's own window would deliver it (the key is taken before the menu sees it).
    const press = (key: string, o: { meta?: boolean } = { meta: true }) =>
      app.evaluate(({ BrowserWindow, webContents }, a) => {
        const win = BrowserWindow.getAllWindows()[0]!
        const guest = webContents.getAllWebContents().find((w) => w.getType() === 'webview')!
        let prevented = false
        guest.emit('before-input-event', { preventDefault: () => (prevented = true) }, { type: 'keyDown', key: a.key, meta: !!a.meta, control: false, alt: false, shift: false })
        return { prevented, guest: guest.getZoomFactor(), host: win.webContents.getZoomFactor() }
      }, { key, ...o })
    const start = await press('x')
    expect(start.prevented).toBe(false)
    const up = await press('=')
    expect(up.prevented).toBe(true)
    expect(up.guest).toBeGreaterThan(start.guest)
    expect(up.host).toBe(start.host)
    const down = await press('-')
    expect(down.guest).toBeCloseTo(start.guest)
    expect((await press('-')).guest).toBeLessThan(start.guest)
    expect((await press('0')).guest).toBeCloseTo(start.guest)
    // The page itself sees the zoom: its width in CSS pixels shrinks as it is zoomed in.
    const wide = (await run('innerWidth')) as number
    await press('=')
    await expect.poll(() => run('innerWidth')).toBeLessThan(wide)
  } finally {
    await shutdown()
  }
})
