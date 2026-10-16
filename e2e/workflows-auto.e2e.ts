import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

test('an agent that commits without announcing a task still gets a run, started by the app from the commit', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-wfauto-'))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: join(tmp, 'args.log'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'health.ts'), 'export const ok = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add health check')

    // The agent's turn ends (the real program says so through its Stop hook): the app reads its commits.
    await expect.poll(() => readFileSync(join(tmp, 'args.log'), 'utf8').includes('--settings')).toBe(true)
    const line = readFileSync(join(tmp, 'args.log'), 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const hook = JSON.parse(readFileSync(line[line.indexOf('--settings') + 1]!, 'utf8')).hooks.Stop[0].hooks[0] as { url: string; headers: Record<string, string> }
    const session_id = line[line.indexOf('--session-id') + 1]
    await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'Stop', session_id }) })
    await expect.poll(async () => (await page.evaluate(() => window.aw.workflows.summary())).runs.length, { timeout: 15_000 }).toBe(1)
    const [run] = (await page.evaluate(() => window.aw.workflows.summary())).runs
    expect(run).toMatchObject({ name: 'ada', title: 'add health check', status: 'done', auto: true })
    expect(run!.rounds[0]!.commits.map((c) => c.subject)).toEqual(['add health check'])

    await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    await expect(page.getByRole('dialog', { name: 'Workflows' }).getByRole('list', { name: 'Runs' })).toContainText('add health check')
    await expect(page.getByRole('dialog', { name: 'Workflows' })).toContainText('from a commit')
  } finally {
    await shutdown()
  }
})
