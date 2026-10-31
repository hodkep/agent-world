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

test('what happened in a run is its story: work added to it is a branch with its own steps, and a command that failed is told with why, in the Runs panel, the flow and the strip', async () => {
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
    const post = (body: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, ...body }) })
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
      return { text: r.content[0]!.text, error: r.isError === true }
    }
    await call('task_begin', { title: 'Release follow-ups' })
    expect((await call('step_done', { step: 'build' })).error).toBe(false)
    // Work is added in the middle: the brief says it has steps of its own and how to report them.
    const added = await call('task_begin', { title: 'Also add a CSV export' })
    expect(added.text).toContain('This is item 2 of "Release follow-ups"')
    expect(added.text).toContain('step_done(id, item: 2)')
    // A step the main chain already has goes to the added work; naming a missing item is refused in words.
    expect((await call('step_done', { step: 'build', item: 9 })).text).toContain('no item 9')
    expect((await call('step_done', { step: 'build' })).error).toBe(false)
    // Commands that failed are part of the story: a commit with no identity, and a push with no network; other failed commands are not.
    const failed = (command: string, error: string) => post({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command }, error })
    await failed('git commit -m "feat: csv"', 'Author identity unknown\n\n*** Please tell me who you are.')
    await failed('git push origin aw/ada', "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com")
    await failed('ls /nope', 'No such file or directory')
    await expect.poll(() => page.evaluate(() => window.aw.workflows.summary().then((s) => (s.runs[0]!.troubles ?? []).map((t) => t.label)))).toEqual(['identity', 'network'])

    // The Runs panel tells it: the work added, and each failure with what the command said.
    await page.getByRole('button', { name: 'Workflows', exact: true }).click()
    await page.getByRole('button', { name: /Release follow-ups/ }).first().click()
    const panel = page.getByRole('region', { name: 'How Release follow-ups went' })
    await expect(panel).toContainText('Added: Also add a CSV export')
    await expect(panel).toContainText('Commit failed')
    await expect(panel).toContainText('Push failed')
    await expect(panel.locator('.rb-chip.identity')).toBeVisible()
    await expect(panel.locator('.rb-chip.network')).toBeVisible()
    await expect(panel).not.toContainText('No such file')
    await panel.getByRole('button', { name: /^Only trouble/ }).click()
    await expect(panel.locator('.rb-tl li')).toHaveCount(2)
    // The flow draws the added work as a branch of its own, and says what it is for (a narrow panel keeps it behind a button).
    const show = panel.getByRole('button', { name: 'Show the flow' })
    if (await show.isVisible()) await show.click()
    await expect(panel.getByLabel(/^Item 2, Build/)).toBeVisible()
    await expect(panel.getByLabel(/^Item 2, Build/)).toContainText('for: Also add a CSV export')
    await client.close()
  } finally {
    await shutdown()
  }
})
