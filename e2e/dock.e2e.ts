import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { approve, hire, launchApp } from './launch'

test('an agent with unmerged commits gets a delivery van; clicking it leads to the merge, which sends the van off', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-dock-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.email', 't@t')
  git(repo, 'config', 'user.name', 't')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_DOCK_MS: '300', AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    page.on('dialog', (d) => void d.accept())
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page)
    await approve(page)
    const stage = page.locator('.stage')
    const vans = async () => JSON.parse((await stage.getAttribute('data-docks')) ?? '[]') as { agentId: string; x: number; y: number }[]
    await page.waitForTimeout(800)
    expect(await vans()).toHaveLength(0) // nothing to deliver yet

    const [agent] = await page.evaluate(() => window.aw.listAgents())
    git(agent!.cwd, 'config', 'user.email', 't@t')
    git(agent!.cwd, 'config', 'user.name', 't')
    for (const f of ['a.ts', 'b.ts']) {
      writeFileSync(join(agent!.cwd, f), `${f}\n`)
      git(agent!.cwd, 'add', '.')
      git(agent!.cwd, 'commit', '-qm', `add ${f}`)
    }
    await expect.poll(async () => (await vans()).length, { timeout: 10_000 }).toBe(1)
    await page.waitForTimeout(1200) // let it finish rolling in
    const [van] = await vans()
    const box = (await stage.boundingBox())!
    await page.mouse.move(box.x + van!.x, box.y + van!.y)
    await expect(page.getByRole('tooltip')).toContainText('2 commits on')
    await page.screenshot({ path: join(__dirname, '..', 'test-results', 'dock.png') })

    await page.mouse.click(box.x + van!.x, box.y + van!.y)
    await expect(page.getByRole('tab', { name: 'Changes' })).toBeVisible()
    await page.getByRole('button', { name: 'Merge into main' }).click()
    await expect(page.locator('.notice')).toContainText('Merged into: main')
    await expect.poll(async () => (await vans()).length, { timeout: 10_000 }).toBe(0)
  } finally {
    await shutdown()
  }
})
