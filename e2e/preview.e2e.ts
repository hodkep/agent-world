import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
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
    await expect(page.getByRole('combobox', { name: 'Local address to preview' })).toHaveValue(`http://localhost:${port}/`)
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

test('the Preview tab keeps its page when you go to the chat and back: the page is not loaded again', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>kept</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-keep-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await expect(page.getByRole('tab', { name: /Preview ●/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: /Preview/ }).click()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> }).executeJavaScript(c), code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('kept')
    // Something that only a page that is still the same page remembers.
    await run('window.__seen = 42')
    await page.getByRole('tab', { name: 'Chat' }).click()
    await page.getByRole('tab', { name: /Preview/ }).click()
    await expect.poll(() => run('window.__seen'), { timeout: 10_000 }).toBe(42)
  } finally {
    await shutdown()
    dev.close()
  }
})

test('the Preview page of a project is still the same page when you switch to another project and back', async () => {
  const dev = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>kept across projects</h1>'))
  await new Promise<void>((r) => dev.listen(0, '127.0.0.1', r))
  const port = (dev.address() as AddressInfo).port
  const home = mkdtempSync(join(tmpdir(), 'aw-keepws-'))
  const repo = (name: string) => {
    const dir = join(home, name)
    mkdirSync(dir)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
    return dir
  }
  const one = repo('project-one')
  const two = repo('project-two')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_DEV_PORT: String(port), FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), one)
    await page.reload()
    await hire(page)
    // Each project has an agent, so each is listed in the project menu.
    await page.evaluate((f) => window.aw.activateWorkspace(f), two)
    await page.reload()
    await hire(page, { name: 'bob' })
    await page.evaluate((f) => window.aw.activateWorkspace(f), one)
    await page.reload()
    await expect(page.locator('.ws-button')).toContainText('project-one')
    await expect(page.getByRole('tab', { name: /Preview ●/ })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('tab', { name: /Preview/ }).click()
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> }).executeJavaScript(c), code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('kept across projects')
    await run('window.__seen = 42')

    // Another project is opened from the project menu without reloading the window, then the first again.
    const open = async (name: RegExp, shown: string) => {
      await page.locator('.ws-button').click()
      await page.getByRole('menuitem', { name }).click()
      await expect(page.locator('.ws-button')).toContainText(shown)
    }
    await open(/project-two/, 'project-two')
    await open(/project-one/, 'project-one')
    await page.getByRole('tab', { name: /Preview/ }).click()
    await expect.poll(() => run('window.__seen'), { timeout: 10_000 }).toBe(42)
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
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
    // Something that is not an address is refused, and says what is accepted.
    await bar.fill('not an address')
    await bar.press('Enter')
    await expect(page.getByRole('alert')).toContainText('not an address I can open')
    // A bare port is enough.
    await bar.fill(String(port))
    await bar.press('Enter')
    await expect(page.getByRole('combobox', { name: 'Local address to preview' })).toHaveValue(`http://localhost:${port}/`)
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
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
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

test('a page on another address is shown after the site is allowed once, with the same toolbar, and is not asked about again', async () => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
  test.skip(!lan, 'no network address on this computer to stand in for a site on the internet')
  const site = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(req.url === '/two' ? '<h1>second page</h1>' : '<main><h1>hello from the site</h1><a id="next" href="/two">next</a><button id="cta">Sign up</button></main>')
  })
  await new Promise<void>((r) => site.listen(0, '0.0.0.0', r))
  const address = `http://${lan}:${(site.address() as AddressInfo).port}/`
  const home = mkdtempSync(join(tmpdir(), 'aw-web-'))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: /Preview/ }).click()
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
    await bar.fill(address)
    await bar.press('Enter')
    // A site that is not this computer's is not loaded until it is allowed: the strip says where it would open.
    const ask = page.getByRole('group', { name: 'Open this site here?' })
    await expect(ask).toContainText(new URL(address).host)
    await expect(ask).toContainText('no access to your files')
    await expect(page.locator('webview')).toHaveCount(0)
    await ask.getByRole('button', { name: 'Open here' }).click()
    // With a user gesture, as a click by a person is: the page's own link then adds a place to go back to.
    const run = (code: string) => page.evaluate(async (c) => {
      // A webview that is not in the page yet, or not ready (it throws at once, not as a failed promise), is no answer yet, so a poll asks again.
      try {
        return (await (document.querySelector('webview') as unknown as { executeJavaScript(c: string, gesture?: boolean): Promise<unknown> } | null)?.executeJavaScript(c, true)) ?? ''
      } catch {
        return ''
      }
    }, code)
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('hello from the site')
    await expect(ask).toHaveCount(0)
    await expect(page.locator('.pa .pa-tag')).toHaveText('web')
    await expect(page.locator('.preview-state.web')).toHaveText('web page')
    // A link inside the page stays in the tab, and back and forward work.
    await run("document.querySelector('#next').click()")
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('second page')
    await expect(page.getByRole('button', { name: 'Back' })).toBeEnabled()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('hello from the site')
    // Select element works on it, as on a local page.
    await page.getByRole('button', { name: 'Select element' }).click()
    await expect(page.getByRole('button', { name: 'Click an element…' })).toBeVisible()
    await page.getByRole('button', { name: 'Click an element…' }).click()
    // The page cannot reach anything that is not a web page: a file address stays where it is.
    await run("location.href = 'file:///etc/hosts'")
    await page.waitForTimeout(500)
    expect(await run('location.protocol')).toBe('http:')
    // It was allowed once, so it opens at once the next time.
    await page.reload()
    await page.getByRole('tab', { name: /Preview/ }).click()
    await expect(page.getByRole('combobox', { name: 'Local address to preview' })).toBeVisible()
    await page.getByRole('combobox', { name: 'Local address to preview' }).fill(address)
    await page.getByRole('combobox', { name: 'Local address to preview' }).press('Enter')
    await expect.poll(() => run('document.body.innerText'), { timeout: 10_000 }).toContain('hello from the site')
    await expect(page.getByRole('group', { name: 'Open this site here?' })).toHaveCount(0)
  } finally {
    await shutdown()
    site.closeAllConnections()
    site.close()
  }
})
