import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

function repo(parent: string, name: string) {
  const dir = join(parent, name)
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
  return dir
}

test('clicking the notice of an agent in another project opens that project with the agent selected', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-notice-')))
  const one = repo(tmp, 'project-one')
  const two = repo(tmp, 'project-two')
  const run = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await run.app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), one)
    await page.reload()
    await hire(page)
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    await page.evaluate((f) => window.aw.activateWorkspace(f), two)
    await page.reload()
    await hire(page, { name: 'bob' })
    await expect(page.locator('.ws-button')).toContainText('project-two')

    // What a click on the notice does in the main process.
    await run.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows()[0]!.webContents.send('select-agent', id), ada!.id)
    await expect(page.locator('.ws-button')).toContainText('project-one')
    await expect(page.locator('.roster button[aria-pressed="true"]')).toContainText('ada')
  } finally {
    await run.shutdown()
  }
})
