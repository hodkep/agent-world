import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { launchApp } from './launch'

const repo = (dir: string) => {
  mkdirSync(dir)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'i'], { cwd: dir })
}

test('two projects can each have an agent with the same name, and the hire form opens in grid mode', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-samename-')))
  const shop = join(tmp, 'shop')
  const blog = join(tmp, 'blog')
  repo(shop)
  repo(blog)
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    const hireNamed = async (name: string) => {
      await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
      const form = page.getByRole('form', { name: 'Hire an agent' })
      await expect(form).toBeVisible()
      await form.getByLabel('Name').fill(name)
      await form.getByRole('button', { name: 'Hire' }).click()
      return form
    }
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), shop)
    await page.reload()
    await (await hireNamed('delta')).waitFor({ state: 'detached' })
    // The same name in the same project is still refused.
    const again = await hireNamed('delta')
    await expect(page.getByText('There is already an agent named delta.')).toBeVisible()
    await again.getByRole('button', { name: 'Cancel' }).click()
    // In another project it is fine.
    await page.evaluate((f) => window.aw.addAgent(f, {}, 'delta'), blog)
    const named = (await page.evaluate(() => window.aw.listAgents())).filter((a) => a.name === 'delta')
    expect(named.map((a) => a.repoPath).sort()).toEqual([blog, shop].sort())

    // In grid mode the side panel is out of the way, and the hire form still opens.
    await page.evaluate(() => (localStorage.setItem('aw.grid', '1'), localStorage.setItem('aw.gridLayout', JSON.stringify({ root: null }))))
    await page.reload()
    await expect(page.locator('.panes')).toBeVisible()
    await expect(page.locator('aside')).toBeHidden()
    const form = await hireNamed('echo')
    await form.waitFor({ state: 'detached' })
    expect((await page.evaluate(() => window.aw.listAgents())).map((a) => a.name)).toContain('echo')
  } finally {
    await shutdown()
  }
})
