// One picture for each new feature of a release, for the release notes: docs/images/releases/<version>/<feature>.png.
// Not part of the normal run: AW_SHOTS=1 pnpm exec playwright test e2e/shots-release.e2e.ts (after pnpm build). Set VERSION and the features to the release's own;
// RELEASING.md says how the notes point at the pictures. Each picture shows the feature and little else, so it reads small in a release.
import { expect, test } from '@playwright/test'
import { SHOTS_ON, shootElement, shotApp } from './shotsKit'

const VERSION = '0.6.2'
const at = (name: string) => `releases/${VERSION}/${name}`

test.skip(!SHOTS_ON, 'The pictures are taken on purpose: AW_SHOTS=1')
test.describe.configure({ mode: 'serial' })

test('accounts: your own login is renamed like any other account', async () => {
  const o = await shotApp({ size: { width: 900, height: 560 } })
  try {
    await o.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = o.page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Accounts' }).click()
    await settings.getByRole('button', { name: 'Rename This computer' }).click()
    await settings.getByLabel('Name of This computer').fill('Laptop')
    await settings.getByLabel('Name of This computer').press('Enter')
    await expect(settings.getByRole('button', { name: 'Rename Laptop' })).toBeVisible()
    await o.page.mouse.move(0, 0)
    await o.page.waitForTimeout(700)
    await shootElement(settings, at('rename-own-login'))
  } finally {
    await o.shutdown()
  }
})
