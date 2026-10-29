import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const hodkep = { id: 'mine', name: 'Agent World', login: 'hodkep', gitName: 'Pratik', gitEmail: 'p@users.noreply.github.com' }
const work = { id: 'work', name: 'Sarvaha work', login: 'pratikGhodke1', gitName: 'Pratik Ghodke', gitEmail: 'pratik.ghodke@sarvaha.com' }

// A gh that holds one login (hodkep) and hands out its token.
const FAKE_GH = `#!/bin/sh
case "$*" in
  "auth status --json hosts") echo '{"hosts":{"github.com":[{"state":"success","active":true,"login":"hodkep"}]}}' ;;
  "auth token --user hodkep") echo gho_fake_hodkep ;;
  *) exit 1 ;;
esac
`

function setup(picked: string | null) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-ident-')))
  const home = join(tmp, 'home')
  const folder = join(tmp, 'proj')
  const bin = join(tmp, 'bin')
  mkdirSync(home, { recursive: true })
  mkdirSync(folder, { recursive: true })
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'gh'), FAKE_GH)
  chmodSync(join(bin, 'gh'), 0o755)
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' } }))
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: folder, recent: [folder] }))
  writeFileSync(join(home, 'identity.json'), JSON.stringify({ profiles: [hodkep, work], byProject: picked ? { [folder]: picked } : {} }))
  return { tmp, home, folder, env: { AW_HOME: home, HOME: tmp, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` } }
}

test('a project acts as its GitHub profile: the chip, Settings and a terminal tab', async () => {
  const s = setup('mine')
  const { app, shutdown } = await launchApp(s.env, s.tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1500, height: 900 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), s.folder)
    await page.reload()

    // The chip beside the project name says who it acts as, and the login is signed in.
    const chip = page.locator('header').locator('.idc')
    await expect(chip).toHaveText('as hodkep')
    await expect(chip).not.toHaveClass(/out/)

    // A terminal tab in the project gets that login's token and commit name.
    const id = await page.evaluate((f) => window.aw.openShell(f), s.folder)
    await page.evaluate((i) => window.aw.ptyWrite(i, 'echo "WHO=$GIT_AUTHOR_NAME/$GIT_COMMITTER_EMAIL/$GH_TOKEN"\n'), id)
    await expect.poll(() => page.evaluate((i) => window.aw.ptyBuffer(i).then((b) => b.text), id)).toContain('WHO=Pratik/p@users.noreply.github.com/gho_fake_hodkep')

    // The chip opens the project's pane; picking another profile whose login is not signed in warns, and the chip turns amber.
    await chip.click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await expect(settings.getByRole('tab', { name: /GitHub identity/ })).toHaveAttribute('aria-selected', 'true')
    await settings.locator('label.hire-opt', { hasText: 'Sarvaha work' }).click()
    await expect(settings.getByRole('alert')).toContainText('pratikGhodke1')
    await page.screenshot({ path: process.env.AW_IDENT_SHOT ?? undefined })
    await settings.getByRole('button', { name: 'Close settings' }).click()
    await expect(chip).toHaveText('pratikghodke1 out')
    await expect(chip).toHaveClass(/out/)

    // "Use current" takes the chip away again.
    await chip.click()
    await settings.locator('label.hire-opt', { hasText: 'Use current' }).click()
    await settings.getByRole('button', { name: 'Close settings' }).click()
    await expect(page.locator('header .idc')).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('a project with no profile shows no chip, and its terminal is not given a token', async () => {
  const s = setup(null)
  const { app, shutdown } = await launchApp(s.env, s.tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), s.folder)
    await page.reload()
    await expect(page.locator('header')).toBeVisible()
    await expect(page.locator('header .idc')).toHaveCount(0)
    const id = await page.evaluate((f) => window.aw.openShell(f), s.folder)
    await page.evaluate((i) => window.aw.ptyWrite(i, 'echo "TOKEN=[$GH_TOKEN]"\n'), id)
    await expect.poll(() => page.evaluate((i) => window.aw.ptyBuffer(i).then((b) => b.text), id)).toContain('TOKEN=[]')
  } finally {
    await shutdown()
  }
})
