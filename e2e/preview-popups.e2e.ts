import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const PAGE = `<title>home</title><h1 id="h">Home</h1><a id="blank" href="/two" target="_blank">two</a><video id="v"></video>`

test('in the Preview, a link for a new tab and window.open open in the same pane, and a page may go fullscreen', async () => {
  const dev = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(req.url === '/two' ? '<title>two</title><h1 id="two">Two</h1>' : req.url === '/three' ? '<title>three</title><h1 id="three">Three</h1>' : PAGE))
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
    const run = (code: string, gesture = false) => page.evaluate(([c, g]) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string, g?: boolean): Promise<unknown> } | null)?.executeJavaScript(c, g), [code, gesture] as const)
    await expect.poll(() => run('!!document.getElementById("h")'), { timeout: 15_000 }).toBe(true)

    await run('document.getElementById("blank").click()', true)
    await expect.poll(() => run('!!document.getElementById("two")')).toBe(true)
    await run('history.back()')
    await expect.poll(() => run('!!document.getElementById("h")')).toBe(true)
    await run('void window.open("/three")', true)
    await expect.poll(() => run('!!document.getElementById("three")')).toBe(true)
    await run('history.back()')
    await expect.poll(() => run('!!document.getElementById("h")')).toBe(true)

    // Fullscreen covers the window, and the window the screen (the instant kind on macOS); leaving puts both back. A leave right after entering
    // (F then Esc at once) must not leave the page stuck in fullscreen, which is what macOS's sliding fullscreen did.
    const box = () => page.evaluate(() => { const r = document.querySelector('webview')!.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), iw: innerWidth, ih: innerHeight } })
    const screen = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]!; return { simple: w.isSimpleFullScreen(), native: w.isFullScreen(), able: w.isFullScreenable() } })
    const mac = process.platform === 'darwin'
    for (const pause of [0, 1500]) {
      await run('document.getElementById("v").requestFullscreen()', true)
      await expect.poll(() => run('document.fullscreenElement?.id ?? null')).toBe('v')
      await expect.poll(async () => { const b = await box(); return b.w === b.iw && b.h === b.ih }).toBe(true)
      if (mac) expect(await screen()).toEqual({ simple: true, native: false, able: false })
      await page.waitForTimeout(pause)
      await run('void document.exitFullscreen()')
      await expect.poll(() => run('document.fullscreenElement === null')).toBe(true)
      await expect.poll(async () => (await box()).w).toBeLessThan((await box()).iw)
      if (mac) await expect.poll(screen).toEqual({ simple: false, native: false, able: true })
    }
  } finally {
    await shutdown()
    dev.close()
  }
})
