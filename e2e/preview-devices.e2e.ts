import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('the Preview shows a page as a phone or tablet, what is picked there says so, and addresses opened before are offered', async () => {
  const dev = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>${req.url === '/' ? 'Shop home' : 'Other'}</title><main><h1>Shop</h1><button id="cta" style="padding:10px">Sign up</button></main>`))
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
    // The webview is drawn a moment after the tab opens (later on a busy machine); until it is, there is nothing to answer, and a poll asks again.
    const run = (code: string) => page.evaluate((c) => (document.querySelector('webview') as unknown as { executeJavaScript(c: string): Promise<unknown> } | null)?.executeJavaScript(c), code)
    await expect.poll(() => run('!!document.getElementById("cta")'), { timeout: 15_000 }).toBe(true)
    const wide = (await run('innerWidth')) as number

    // One small button names the screen size; desktop is the one it starts on, and needs no caption.
    const size = page.getByRole('button', { name: /^Screen size:/ })
    await expect(size).toHaveAccessibleName('Screen size: Desktop')
    await expect(page.locator('.preview-cap')).toHaveCount(0)
    await size.click()
    await expect(page.getByRole('menuitemradio')).toHaveText([/Desktop/, /Tablet/, /Mobile/])
    await page.getByRole('menuitemradio', { name: /Mobile/ }).click()
    await expect(size).toHaveAccessibleName('Screen size: Mobile')
    await expect(page.locator('.preview-cap')).toContainText('Mobile')
    await expect(page.locator('.preview-cap select')).toHaveValue('iPhone 14')
    // The page really is 390 wide to itself, and the browser bar's icons name themselves on hover.
    await expect.poll(() => run('innerWidth')).toBe(390)
    for (const name of ['Back', 'Forward', 'Reload', 'Select element', 'Open in browser']) await expect(page.locator('.preview-nav').getByRole('button', { name })).toHaveAttribute('title', /.+/)
    await page.screenshot({ path: join(tmpdir(), 'aw-preview-mobile.png') })
    await page.locator('.preview-cap select').selectOption('iPhone SE')
    await expect.poll(() => run('innerWidth')).toBe(375)
    await page.getByRole('button', { name: 'Turn it on its side' }).click()
    await expect.poll(() => run('innerWidth')).toBe(667)
    await page.getByRole('button', { name: 'Turn it on its side' }).click()

    // Something picked here is labelled with the view, in the message box and in what is sent.
    await page.getByRole('button', { name: 'Select element' }).click()
    await run("const b = document.querySelector('#cta').getBoundingClientRect(); const at = { clientX: b.left + 5, clientY: b.top + 5, bubbles: true }; window.dispatchEvent(new MouseEvent('mousemove', at)); window.dispatchEvent(new MouseEvent('click', at))")
    const chip = page.locator('.attached li.chip-context')
    await expect(chip.locator('.chip-view')).toHaveText('Mobile', { timeout: 10_000 })
    await expect(chip.locator('.chip-view')).toHaveAttribute('title', /Seen at Mobile 375×667/)
    await page.getByRole('textbox', { name: /^Message/ }).fill('fix this')
    await page.getByRole('textbox', { name: /^Message/ }).press('Enter')
    const sent = page.getByRole('log', { name: /Conversation with/ }).locator('.msg.user').last()
    await expect(sent.locator('.pick-card .chip-view')).toHaveText('Mobile', { timeout: 10_000 })
    await sent.locator('.pick-card summary').click()
    await expect(sent.locator('.pick-card')).toContainText('Mobile 375×667')

    // Back on desktop: no caption again, and the page has the room it had.
    await page.getByRole('tab', { name: /Preview/ }).click()
    await page.getByRole('button', { name: /^Screen size:/ }).click()
    await page.getByRole('menuitemradio', { name: /Desktop/ }).click()
    await expect(page.locator('.preview-cap')).toHaveCount(0)
    await expect.poll(() => run('innerWidth')).toBe(wide)

    // Addresses opened before are offered: the running server first, then pages visited, narrowed as you type.
    const bar = page.getByRole('combobox', { name: 'Local address to preview' })
    await bar.fill(`${port}/other`)
    await bar.press('Enter')
    await expect.poll(() => run('document.title')).toBe('Other')
    await bar.click()
    const list = page.getByRole('listbox', { name: 'Addresses' })
    await expect(list.getByRole('option', { name: new RegExp(`localhost:${port}/other.*Other`) })).toBeVisible()
    await expect(list.getByRole('option', { name: new RegExp(`localhost:${port}/ .*Shop home|localhost:${port}.*Shop home`) })).toBeVisible()
    await bar.fill(String(port).slice(0, 3))
    await expect(list.getByRole('option')).not.toHaveCount(0)
    await bar.fill('zzzz')
    await expect(list.getByRole('option')).toHaveCount(0)
    await bar.fill(`${port}/oth`)
    await expect(page.locator('.pa-ghost')).toContainText('er')
    await bar.press('Tab')
    await expect(bar).toHaveValue(`localhost:${port}/other`)
    // One click on an address opens it; the ✕ forgets it.
    await bar.fill('')
    // The row opens its page when the mouse goes down, and the list closes under the pointer while the webview starts its navigation: on a busy machine
    // the real click then waited out its 30 seconds in the pipe to the page. The press is sent to the row itself, and the next line waits for the page.
    await list.getByRole('option', { name: /Shop home/ }).first().dispatchEvent('mousedown')
    await expect.poll(() => run('document.title')).toBe('Shop home')
    await bar.click()
    await list.getByRole('option', { name: /\/other/ }).hover()
    await list.getByRole('button', { name: new RegExp(`Forget localhost:${port}/other`) }).click()
    await expect(list.getByRole('option', { name: /\/other/ })).toHaveCount(0)
  } finally {
    await shutdown()
    dev.close()
  }
})
