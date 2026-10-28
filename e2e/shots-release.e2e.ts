// One picture for each new feature of a release, for the release notes: docs/images/releases/<version>/<feature>.png.
// Not part of the normal run: AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts (after pnpm build). Set VERSION and the features to the release's own;
// RELEASING.md says how the notes point at the pictures. Each picture shows the feature and little else, so it reads small in a release.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hireNamed, SHOTS_ON, shoot, shootElement, shotApp } from './shotsKit'
import pkg from '../package.json'

const VERSION = '0.6.3'
const at = (name: string) => `releases/${VERSION}/${name}`

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1')
test.describe.configure({ mode: 'serial' })

test('updates: a Stable and a Beta row, the beta found and ready to download', async () => {
  // A release server of the shot's own (AW_UPDATE_RELEASES): this version is the latest stable, and a beta of the next one is out.
  const releases = [{ tag_name: 'v0.7.0-beta.1', prerelease: true, draft: false, published_at: '2026-10-29T10:00:00Z', body: '## Beta notes\n\n- Ask the agent to change how the app looks, and keep or undo it' }]
  const server = createServer((req, res) => {
    const json = (v: unknown) => void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(v))
    if (req.url === '/api/repos/hodkep/agent-world/releases/latest') return json({ tag_name: `v${pkg.version}` })
    if (req.url === '/api/repos/hodkep/agent-world/releases?per_page=30') return json(releases)
    res.writeHead(404).end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const o = await shotApp({ size: { width: 900, height: 1200 }, env: { AW_UPDATE_RELEASES: `http://127.0.0.1:${(server.address() as AddressInfo).port}` } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Updates' }).click()
    await settings.getByRole('button', { name: 'Check now' }).click()
    await settings.getByRole('button', { name: 'Check for a beta' }).click()
    await expect(settings).toContainText('0.7.0-beta.1')
    await expect(settings).toContainText('replaces the stable app you have')
    await o.page.mouse.move(0, 0)
    await o.page.waitForTimeout(700)
    // The dialog is only so tall and its pane scrolls inside: for the picture both grow to their content, so it ends at the Download button, not mid-way.
    await settings.evaluate((el) => Object.assign(el.style, { maxHeight: 'none', height: 'auto' }))
    await settings.locator('fieldset').evaluate((el) => Object.assign(el.style, { maxHeight: 'none', height: 'auto', overflow: 'visible' }))
    await o.page.waitForTimeout(300)
    // The pane fills the window now: the picture stops at the foot of the Beta row.
    const top = (await settings.locator('fieldset').boundingBox())!
    const foot = (await settings.locator('.upd-chan').last().boundingBox())!
    await shoot(o.page, at('beta-row'), { x: top.x, y: top.y, width: top.width, height: foot.y + foot.height - top.y + 12 })
  } finally {
    await o.shutdown()
    server.close()
  }
})

test('chat: a git graph in a reply is drawn in readable colours', async () => {
  const o = await shotApp({ size: { width: 1000, height: 1000 }, env: { FAKE_SAY_FILE: resolve(__dirname, 'fixtures/mermaid-git.md') } })
  try {
    await hireNamed(o.page, 'ada')
    await o.page.getByRole('tab', { name: 'Chat' }).click()
    const graph = o.page.getByRole('log', { name: 'Conversation with ada' }).locator('.mermaid').first()
    await expect(graph.locator('svg')).toBeVisible({ timeout: 20_000 })
    await graph.scrollIntoViewIfNeeded()
    await o.page.mouse.move(0, 0)
    await o.page.waitForTimeout(700)
    await shootElement(graph.locator('svg'), at('git-graph'))
  } finally {
    await o.shutdown()
  }
})
