#!/usr/bin/env node
// Starts a built Agent World (the AppImage people download, or the unpacked app) with an empty office of its own and waits until the office is on screen.
//   xvfb-run -a node scripts/smoke-linux.mjs dist/Agent-World-0.14.0-x64.AppImage
// The Chromium sandbox is off for this one start: a CI runner (like Ubuntu 24.04 and later) does not let an AppImage set it up, and a deb sets it up itself. It is not off in the app.
import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const bin = process.argv[2]
if (!bin) {
  console.error('usage: node scripts/smoke-linux.mjs <AppImage or app binary>')
  process.exit(2)
}
const home = mkdtempSync(join(tmpdir(), 'aw-smoke-'))
const app = await electron.launch({
  executablePath: resolve(bin),
  args: ['--no-sandbox'],
  env: { ...process.env, AW_HOME: home, AW_NO_SETUP: '1', AW_HIDDEN: '1', AW_ZOOM: '1' },
  timeout: 60_000
})
// Taken now: once the app is closed Playwright no longer knows it, and asking for its process then throws.
const proc = app.process()
let failed = false
try {
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.locator('header').getByRole('button', { name: '+ Agent' }).waitFor({ timeout: 60_000 })
  const info = await app.evaluate(({ app: a }) => ({ version: a.getVersion(), packaged: a.isPackaged }))
  console.log(`office is up: ${JSON.stringify(info)}`)
  if (!info.packaged) throw new Error('this is not a packaged app')
} catch (e) {
  failed = true
  console.error(`smoke failed: ${e instanceof Error ? e.message : e}`)
} finally {
  await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
  proc.kill('SIGKILL')
  rmSync(home, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
