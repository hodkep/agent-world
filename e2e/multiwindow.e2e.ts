import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const repo = (dir: string) => {
  mkdirSync(dir, { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
}

test('every window opens on the project picker and works on the project it is given, independently of the others', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-multi-')))
  const a = join(tmp, 'alpha')
  const b = join(tmp, 'beta')
  repo(a)
  repo(b)
  const home = join(tmp, 'home')
  mkdirSync(home)
  writeFileSync(join(home, 'workspaces.json'), JSON.stringify({ active: a, recent: [a, b] }))
  const env = { AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs') }
  const { app, shutdown } = await launchApp(env, tmp)
  try {
    const first = await app.firstWindow()
    const pickerOf = (page: typeof first) => page.getByRole('dialog', { name: 'Choose a project for this window' })
    // Even though "alpha" was the last project, a fresh window asks.
    await expect(pickerOf(first)).toBeVisible()
    await expect(pickerOf(first).getByRole('button', { name: /^alpha/ })).toBeVisible()
    await first.screenshot({ path: join(__dirname, '..', 'test-results', 'picker.png') })
    await pickerOf(first).getByRole('button', { name: /^alpha/ }).click()
    await expect(pickerOf(first)).toHaveCount(0)
    await expect(first.locator('.ws-name')).toHaveText('alpha')

    // A second window is opened from the project menu and starts on the picker; the first is left as it was.
    const next = app.waitForEvent('window')
    await first.locator('.ws-button').click()
    await first.getByRole('menuitem', { name: 'New window' }).click()
    const win2 = await next
    await expect(pickerOf(win2)).toBeVisible()
    await pickerOf(win2).getByRole('button', { name: /^beta/ }).click()
    await expect(win2.locator('.ws-name')).toHaveText('beta')
    await expect(first.locator('.ws-name')).toHaveText('alpha')
    await expect(pickerOf(first)).toHaveCount(0)

    // And another one still: each opens on the picker.
    const third = app.waitForEvent('window')
    await first.locator('.ws-button').click()
    await first.getByRole('menuitem', { name: 'New window' }).click()
    await expect(pickerOf(await third)).toBeVisible()
  } finally {
    await shutdown()
  }
})
