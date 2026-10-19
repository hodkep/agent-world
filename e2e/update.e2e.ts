import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'
import { shot } from './wf-helpers'
import pkg from '../package.json'

// The update of a build without a Developer ID, against a release server of the test's own (AW_UPDATE_RELEASES: honoured only by an app that is not installed)
// and a fake app bundle to replace (AW_UPDATE_APP_PATH). A real replacement on a real Mac, with a real codesign and open, is tried by hand.
const NEW = '0.9.0'
const plist = (version: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>dev.agentworld.app</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`
const bundle = (parent: string, name: string, version: string, marker: string) => {
  const b = join(parent, name)
  mkdirSync(join(b, 'Contents'), { recursive: true })
  writeFileSync(join(b, 'Contents', 'Info.plist'), plist(version))
  writeFileSync(join(b, 'Contents', 'marker'), marker)
  return b
}
const tool = (root: string, name: string, body: string) => {
  const p = join(root, name)
  writeFileSync(p, `#!/bin/sh\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}

async function world(o: { badChecksum?: boolean; fakeApp?: boolean; body?: string; prefs?: object } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'aw-upd-')))
  const src = join(root, 'src')
  mkdirSync(src)
  bundle(src, 'Agent World.app', NEW, 'new')
  const zip = join(root, 'new.zip')
  expect(spawnSync('/usr/bin/ditto', ['-c', '-k', src, zip]).status).toBe(0)
  const bytes = readFileSync(zip)
  const sha = o.badChecksum ? createHash('sha512').update('other').digest('base64') : createHash('sha512').update(bytes).digest('base64')
  const yml = `version: ${NEW}\nfiles:\n${['arm64', 'x64'].map((a) => `  - url: Agent-World-${NEW}-${a}.zip\n    sha512: ${sha}\n    size: ${bytes.length}\n`).join('')}path: Agent-World-${NEW}-x64.zip\n`
  const base = `/hodkep/agent-world/releases/download/v${NEW}`
  const server = createServer((req, res) => {
    if (req.url === '/api/repos/hodkep/agent-world/releases/latest') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ tag_name: `v${NEW}`, ...(o.body && { body: o.body }) }))
    if (req.url === `${base}/latest-mac.yml`) return void res.writeHead(200).end(yml)
    if (req.url?.startsWith(`${base}/Agent-World-${NEW}-`) && req.url.endsWith('.zip')) return void res.writeHead(200, { 'content-length': bytes.length }).end(bytes)
    res.writeHead(404).end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const apps = join(root, 'Apps')
  mkdirSync(apps)
  const app = bundle(apps, 'Agent World.app', '0.1.1', 'old')
  const opened = join(root, 'opened.log')
  const env = { AW_HOME: join(root, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_UPDATE_RELEASES: origin, AW_OPEN: tool(root, 'open', `echo "$@" >> "${opened}"`), AW_CODESIGN: tool(root, 'codesign-ok', 'exit 0'), ...(o.fakeApp === false ? {} : { AW_UPDATE_APP_PATH: app }) }
  if (o.prefs) {
    mkdirSync(join(root, 'home'), { recursive: true })
    writeFileSync(join(root, 'home', 'preferences.json'), JSON.stringify(o.prefs))
  }
  const { app: electron, shutdown } = await launchApp(env, root)
  const page = await electron.firstWindow()
  const close = async () => (server.close(), await shutdown())
  return { root, app, opened, electron, page, close }
}

test('an unsigned Mac build is offered the update, downloads it with progress, checks it, and replaces itself and reopens', async () => {
  test.skip(process.platform !== 'darwin', 'it replaces an app bundle with ditto, as macOS does')
  test.setTimeout(120_000)
  const w = await world()
  try {
    const { page } = w
    await page.evaluate(() => window.aw.checkUpdates())
    const chip = page.getByRole('button', { name: /Agent World 0\.9\.0 is available/ })
    await expect(chip).toHaveText('↑ 0.9.0')
    await chip.click()
    const pop = page.getByRole('dialog', { name: 'Agent World update' })
    await expect(pop).toContainText('Agent World 0.9.0 is available')
    await expect(pop).toContainText(`You have ${pkg.version}`)
    await pop.getByRole('button', { name: 'Download' }).click()
    await expect(pop).toContainText('0.9.0 is ready to install', { timeout: 30_000 })
    await expect(pop).toContainText("Checksum matches the release's")
    // Settings shows the same state and the same buttons.
    await page.keyboard.press('Escape')
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Updates' }).click()
    await expect(settings.getByRole('group', { name: 'Update' })).toContainText('0.9.0 is ready to install')
    await expect(settings.getByRole('button', { name: 'Install and restart' })).toBeVisible()
    const closed = w.electron.waitForEvent('close', { timeout: 60_000 })
    await settings.getByRole('button', { name: 'Install and restart' }).click()
    await closed
    // The helper replaces the fake bundle after the app has quit, and opens it.
    await expect.poll(() => (existsSync(join(w.app, 'Contents', 'marker')) ? readFileSync(join(w.app, 'Contents', 'marker'), 'utf8') : ''), { timeout: 30_000 }).toBe('new')
    await expect.poll(() => (existsSync(w.opened) ? readFileSync(w.opened, 'utf8').trim() : ''), { timeout: 30_000 }).toBe(w.app)
  } finally {
    await w.close()
  }
})

test('a download whose checksum is not the published one is dropped, and says so, with a way to try again', async () => {
  test.skip(process.platform !== 'darwin', 'it builds the fake release with ditto')
  const w = await world({ badChecksum: true })
  try {
    const { page } = w
    await page.evaluate(() => window.aw.checkUpdates())
    await page.getByRole('button', { name: /Agent World 0\.9\.0 is available/ }).click()
    const pop = page.getByRole('dialog', { name: 'Agent World update' })
    await pop.getByRole('button', { name: 'Download' }).click()
    await expect(pop).toContainText('The download was not used', { timeout: 30_000 })
    await expect(pop.getByRole('alert')).toContainText('does not match the checksum')
    await expect(pop.getByRole('button', { name: 'Download again' })).toBeVisible()
    await expect(pop.getByRole('button', { name: 'Open the release page' })).toBeVisible()
  } finally {
    await w.close()
  }
})

test('where the app cannot tell what to replace it keeps the download, says why, and does not quit', async () => {
  test.skip(process.platform !== 'darwin', 'it builds the fake release with ditto')
  const w = await world({ fakeApp: false })
  try {
    const { page } = w
    await page.evaluate(() => window.aw.checkUpdates())
    await page.getByRole('button', { name: /Agent World 0\.9\.0 is available/ }).click()
    const pop = page.getByRole('dialog', { name: 'Agent World update' })
    await pop.getByRole('button', { name: 'Download' }).click()
    await expect(pop).toContainText('0.9.0 is ready to install', { timeout: 30_000 })
    await pop.getByRole('button', { name: 'Install and restart' }).click()
    await expect(pop).toContainText('cannot be installed from here')
    await expect(pop.getByRole('alert')).toContainText('cannot tell where it is installed')
    await expect(pop.getByRole('button', { name: 'Show in Finder' })).toBeVisible()
    expect(existsSync(w.opened)).toBe(false)
  } finally {
    await w.close()
  }
})

test("Updates shows the installed version and its What's new, the new version's notes before Download, and Check now is greyed from the moment a download starts", async () => {
  test.skip(process.platform !== 'darwin', 'it downloads with the Mac installer code')
  test.setTimeout(120_000)
  const body = '## Highlights\n\n- A fast thing\n\n<script>window.pwned = 1</script>\n\n[bad](javascript:alert(1)) ![pic](https://x.test/a.png) [ok](https://example.com/x)'
  const w = await world({ body })
  try {
    const { page } = w
    await page.evaluate(() => window.aw.checkUpdates())
    await page.getByRole('button', { name: /Agent World 0\.9\.0 is available/ }).click()
    const pop = page.getByRole('dialog', { name: 'Agent World update' })
    // The release's own text, read before Download: cleaned (no script run, no picture, no javascript: link), with its good link kept.
    const notes = pop.getByRole('region', { name: "What's new in 0.9.0" })
    await expect(notes).toContainText('A fast thing')
    await shot(page, 'whatsnew-1-popover-notes')
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
    await expect(notes.locator('img, script')).toHaveCount(0)
    await expect(notes.locator('a[href^="javascript"]')).toHaveCount(0)
    await expect(notes.locator('a[href="https://example.com/x"]')).toHaveCount(1)
    await pop.getByRole('button', { name: 'Download' }).click()
    await expect(pop).toContainText('0.9.0 is ready to install', { timeout: 30_000 })
    await page.keyboard.press('Escape')

    // Settings > Updates: the version installed, its notes from the changelog that came with the app, and Check now greyed with the reason.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Updates' }).click()
    await expect(settings.locator('.upd-version')).toContainText(`Agent World ${pkg.version}`)
    const check = settings.getByRole('button', { name: 'Check now' })
    await expect(check).toBeDisabled()
    await shot(page, 'whatsnew-2-settings-updates')
    await expect(check).toHaveAttribute('title', '0.9.0 is downloaded; restart to install it.')
    await settings.getByRole('button', { name: "What's new" }).click()
    const dialog = page.getByRole('dialog', { name: `What's new in ${pkg.version}` })
    await expect(dialog).toContainText(`What's new in ${pkg.version}`)
    await expect(dialog.getByRole('region', { name: `Notes of ${pkg.version}` })).not.toBeEmpty()
    await shot(page, 'whatsnew-3-dialog')
  } finally {
    await w.close()
  }
})

test("after an update the app says so once, with a way to read what is new, and the first start only learns the version", async () => {
  test.setTimeout(60_000)
  const w = await world({ prefs: { seenVersion: '0.0.1' } })
  try {
    const { page } = w
    const banner = page.getByRole('status').filter({ hasText: `Updated to Agent World ${pkg.version}` })
    await expect(banner).toBeVisible()
    await shot(page, 'whatsnew-4-banner')
    await banner.getByRole('button', { name: "See what's new" }).click()
    await expect(page.getByRole('dialog', { name: `What's new in ${pkg.version}` })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(banner).toBeHidden()
    await page.reload()
    await expect(page.locator('.upd-banner')).toHaveCount(0)
  } finally {
    await w.close()
  }
  const first = await world()
  try {
    await first.page.waitForTimeout(1500)
    await expect(first.page.locator('.upd-banner')).toHaveCount(0)
    await expect.poll(async () => (await first.page.evaluate(() => window.aw.getPrefs())).seenVersion).toBe(pkg.version)
  } finally {
    await first.close()
  }
})

