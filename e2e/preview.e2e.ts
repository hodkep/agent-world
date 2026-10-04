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

test('selecting an element on the preview adds it to the message as one chip of context', async () => {
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
    // One chip says what was picked and where from; the words behind it stay out of the message box.
    const chip = page.locator('.attached li.chip-context')
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await expect(chip).toContainText('Preview')
    await expect(chip).toContainText(`button on localhost:${port}`)
    await expect(chip.locator('img')).toHaveCount(1)
    await expect(box).toHaveValue('')
    if (process.env.AW_SHOTS) await page.screenshot({ path: `${process.env.AW_SHOTS}/context-chip.png` })
    await expect(page.getByRole('tab', { name: 'Chat', selected: true })).toBeVisible()
    // Typed text goes with it, and what the agent receives carries the selector, text and address.
    await box.fill('make this bigger')
    await box.press('Enter')
    const sent = page.getByRole('log', { name: 'Conversation with ada' }).locator('.msg.user').last()
    await expect(sent).toContainText('make this bigger', { timeout: 10_000 })
    // In the conversation it is one small card, not the page's HTML; a click opens what was picked.
    const card = sent.locator('.pick-card')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(`button on localhost:${port}`)
    await expect(sent.locator('.pick-body')).toBeHidden()
    await card.locator('summary').click()
    await expect(card).toContainText(/Selector.*button#cta/)
    await expect(card).toContainText('Sign up')
    await expect(card).toContainText(`http://localhost:${port}/`)
    await expect(chip).toHaveCount(0)
  } finally {
    await shutdown()
    dev.close()
  }
})

test('an address typed into the Preview bar opens even though the agent never printed it', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>started by someone else</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-prevbar-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const bar = page.getByRole('textbox', { name: 'Local address to preview' })
    // Nothing but a local address is accepted.
    await bar.fill('example.com')
    await bar.press('Enter')
    await expect(page.getByRole('alert')).toContainText('on this computer')
    // A bare port is enough.
    await bar.fill(String(port))
    await bar.press('Enter')
    await expect(page.locator('.preview-url')).toHaveText(`http://localhost:${port}/`)
    const text = () => page.evaluate(() => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<string> }).executeJavaScript('document.body.innerText'))
    await expect.poll(text, { timeout: 10_000 }).toContain('started by someone else')
  } finally {
    await shutdown()
    dev.close()
  }
})

test('the picture of a picked element is that element, at the app\'s own zoom as well as at 100%', async () => {
  const page_html = '<body style="margin:0;background:#2244aa"><div style="height:380px"></div><div id="t" style="margin-left:60px;width:300px;height:40px;background:#ff0000"></div></body>'
  for (const zoom of ['1', '1.2']) {
    const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(page_html))
    await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
    const port = (dev.address() as AddressInfo).port
    const home = mkdtempSync(join(tmpdir(), 'aw-pz-'))
    const { app, shutdown } = await launchApp({ AW_ZOOM: zoom, AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port) }, home)
    try {
      const page = await app.firstWindow()
      await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
      await page.reload()
      await hire(page)
      await page.getByRole('tab', { name: /Preview/ }).click()
      const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> }).executeJavaScript(c), code)
      await expect.poll(() => run('!!document.getElementById("t")'), { timeout: 10_000 }).toBe(true)
      await page.getByRole('button', { name: 'Select element' }).click()
      await run("const b = document.querySelector('#t').getBoundingClientRect(); const at = { clientX: b.left + 5, clientY: b.top + 5, bubbles: true }; window.dispatchEvent(new MouseEvent('mousemove', at)); window.dispatchEvent(new MouseEvent('click', at))")
      const chip = page.locator('.attached li.chip-context img')
      await expect(chip).toHaveCount(1, { timeout: 10_000 })
      // Nothing but the red box is in the picture: its middle and its corners are all red.
      const colours = await chip.evaluate(async (img: HTMLImageElement) => {
        await img.decode()
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const g = c.getContext('2d')!
        g.drawImage(img, 0, 0)
        const at = (x: number, y: number) => Array.from(g.getImageData(x, y, 1, 1).data).slice(0, 3).join(',')
        return [at(c.width >> 1, c.height >> 1), at(2, 2), at(c.width - 3, c.height - 3)]
      })
      expect(colours, `at zoom ${zoom}`).toEqual(['255,0,0', '255,0,0', '255,0,0'])
    } finally {
      await shutdown()
      dev.close()
    }
  }
})

test('an address nothing answers on says so, not a blank page, and the page appears by itself once a server starts there', async () => {
  // A port that is free: a server is started on it and stopped again.
  const probe = createServer()
  await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r))
  const port = (probe.address() as AddressInfo).port
  await new Promise<void>((r) => probe.close(() => r()))
  const home = mkdtempSync(join(tmpdir(), 'aw-prevdown-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  let dev: ReturnType<typeof createServer> | undefined
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const bar = page.getByRole('textbox', { name: 'Local address to preview' })
    await bar.fill(String(port))
    await bar.press('Enter')
    // Nothing is listening: the panel says so and the state says it too.
    const down = page.locator('.preview-down')
    await expect(down).toContainText(`Nothing is answering at localhost:${port}`, { timeout: 10_000 })
    await expect(page.locator('.preview-state')).toHaveText('not answering')
    await expect(page.locator('webview')).toHaveCount(0)
    // Start it: the page shows up without asking.
    dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>now it is up</h1>'))
    await new Promise<void>((r) => dev!.listen(port, '127.0.0.1', r))
    await expect(page.locator('.preview-state')).toHaveText('running', { timeout: 15_000 })
    await expect(down).toHaveCount(0)
    const text = () => page.evaluate(() => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<string> }).executeJavaScript('document.body.innerText'))
    await expect.poll(text, { timeout: 10_000 }).toContain('now it is up')
  } finally {
    await shutdown()
    dev?.close()
  }
})
