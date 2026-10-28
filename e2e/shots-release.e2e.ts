// One picture for each new feature of a release, for the release notes: docs/images/releases/<version>/<feature>.png.
// Not part of the normal run: AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts (after pnpm build). Set VERSION and the features to the release's own;
// RELEASING.md says how the notes point at the pictures. Each picture shows the feature and little else, so it reads small in a release.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { SHOTS_ON, shoot, shotApp } from './shotsKit'

const VERSION = '0.6.4'
const at = (name: string) => `releases/${VERSION}/${name}`

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1')
test.describe.configure({ mode: 'serial' })

test('updates: on a beta, the Stable row offers the way back to the latest stable', async () => {
  // A release server of the shot's own (AW_UPDATE_RELEASES), and a beta standing in for the installed version (AW_APP_VERSION): the latest stable is older than it.
  const server = createServer((req, res) => {
    const json = (v: unknown) => void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(v))
    if (req.url === '/api/repos/hodkep/agent-world/releases/latest') return json({ tag_name: 'v0.6.3', published_at: '2026-10-28T10:00:00Z' })
    res.writeHead(404).end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const o = await shotApp({ size: { width: 900, height: 1200 }, env: { AW_APP_VERSION: '0.7.0-beta.1', AW_UPDATE_RELEASES: `http://127.0.0.1:${(server.address() as AddressInfo).port}` } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Updates' }).click()
    await settings.getByRole('button', { name: 'Check now' }).click()
    await expect(settings).toContainText('Back to stable')
    await expect(settings).toContainText('Going back replaces the beta you have')
    await o.page.mouse.move(0, 0)
    // The dialog is only so tall and its pane scrolls inside: for the picture both grow to their content, and it stops at the foot of the Stable row.
    await settings.evaluate((el) => Object.assign(el.style, { maxHeight: 'none', height: 'auto' }))
    await settings.locator('fieldset').evaluate((el) => Object.assign(el.style, { maxHeight: 'none', height: 'auto', overflow: 'visible' }))
    await o.page.waitForTimeout(700)
    const top = (await settings.locator('fieldset').boundingBox())!
    const foot = (await settings.locator('.upd-chan').first().boundingBox())!
    await shoot(o.page, at('back-to-stable'), { x: top.x, y: top.y, width: top.width, height: foot.y + foot.height - top.y + 12 })
  } finally {
    await o.shutdown()
    server.close()
  }
})
