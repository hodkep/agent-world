import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

test('closing the window with a live agent does not crash the main process', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-quit-'))
  const log = join(home, 'uncaught.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, home)
  try {
    // Electron shows a blocking dialog for uncaught main-process errors; record them instead.
    await app.evaluate((_, file) => {
      const fs = process.mainModule!.require('node:fs')
      process.prependListener('uncaughtException', (e) => {
        fs.appendFileSync(file, `${e.message}\n`)
        process.exit(0)
      })
    }, log)
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await page.getByRole('button', { name: '+ Agent' }).click()
    await expect(page.locator('.term-host:visible')).toContainText('fake claude')

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close()).catch(() => {})
    await new Promise((r) => setTimeout(r, 2000))
    expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toBe('')
  } finally {
    await shutdown()
  }
})
