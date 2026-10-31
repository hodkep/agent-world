import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const SHIP = {
  version: 1,
  id: 'ship',
  name: 'Ship',
  when: 'Code changes.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'auto' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'commit', kind: 'work', name: 'Commit', start: 'run' },
    { id: 'push', kind: 'work', name: 'Push', start: 'run' },
    { id: 'pr', kind: 'pr', name: 'Pull request', start: 'run' }
  ]
}

test('a task that needs no commit, push or pull request: the agent asks once, one card and one button skip all three, and the task can finish', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfskip-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
  writeFileSync(join(repo, '.agent-world', 'workflows', 'ship.json'), JSON.stringify(SHIP))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'workflows')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, defaults: { [repo]: 'ship' } } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    await expect.poll(() => readLog(argsLog).includes('--settings')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const flag = (f: string) => launch[launch.indexOf(f) + 1]!
    const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
      return { text: r.content[0]!.text, error: r.isError === true }
    }
    await call('task_begin', { title: 'Release follow-ups' })
    expect((await call('step_done', { step: 'build' })).error).toBe(false)
    // The agent cannot skip them on its own, nor one by one.
    expect((await call('step_done', { step: 'commit', skipped: true, why: 'x' })).error).toBe(true)
    expect((await call('step_done', { step: 'push', skipped: true, why: 'x' })).error).toBe(true)
    expect((await call('task_done', {})).error).toBe(true)
    // It asks once for all three, with its reason.
    const asked = await call('skip_steps', { steps: ['commit', 'push', 'pr'], why: 'Everything went out as merged PRs; the branch has nothing to commit.' })
    expect(asked.text).toContain('Asked the person to skip Commit, Push, Pull request.')
    expect((await call('skip_steps', { steps: ['push'], why: 'again' })).error).toBe(true)

    await page.getByRole('tab', { name: 'Chat' }).click()
    const card = page.getByRole('region', { name: 'Skip steps for ada' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('Everything went out as merged PRs')
    await expect(card.locator('.sg-chip')).toHaveText(['Commit', 'Push', 'Pull request'])
    // While it waits it is the only question about those steps.
    await expect(page.getByRole('region', { name: /^(Run|Step from)/ })).toHaveCount(0)
    await card.getByRole('button', { name: 'Skip all three' }).click()
    await expect(card).toHaveCount(0)

    // Skipped, with the reason on each step, and with all of them met or skipped the strip has nothing left to show.
    const skippedSteps = async () => (await page.evaluate(() => window.aw.workflows.summary().then((s) => s.runs[0]!.rounds[0]!.steps.filter((x) => x.state === 'skipped').map((x) => `${x.step}: ${x.note}`))))
    await expect.poll(skippedSteps).toEqual(['commit', 'push', 'pr'].map((id) => `${id}: Everything went out as merged PRs; the branch has nothing to commit.`))
    await expect(page.getByRole('region', { name: 'Release follow-ups: where ada is' })).toHaveCount(0)
    expect((await call('task_done', { summary: 'Nothing to ship.' })).error).toBe(false)
    const [run] = await page.evaluate(() => window.aw.workflows.summary().then((s) => s.runs))
    expect(run!.status).toBe('done')
    await client.close()
  } finally {
    await shutdown()
  }
})
