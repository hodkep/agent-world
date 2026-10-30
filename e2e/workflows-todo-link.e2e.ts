import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text

test('a run belongs to the task its agent is on: the ledger shows the task, the task shows the run and opens it, and finishing the run finishes the task', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wftodo-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'economy', since: 1, planGate: false, mergeGate: false } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_USER_HOME: join(tmp, 'user'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    await expect.poll(() => readLog(argsLog).includes('--mcp-config')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcp = JSON.parse(readFileSync(launch[launch.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    const call = async (name: string, args: Record<string, unknown> = {}) => say(await client.callTool({ name, arguments: args }))

    // The agent is on a task of the board, and begins a run.
    expect(await call('todo_add', { title: 'Add a dark-mode toggle', list: 'Workflows' })).toContain('todo#1')
    await call('todo_claim', { id: '1' })
    await call('task_begin', { title: 'Add a dark-mode toggle' })

    // The ledger says which task the run belongs to, and the chip opens it.
    await page.locator('header').getByRole('button', { name: 'Workflows' }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    const row = win.getByRole('table', { name: 'Runs' }).getByRole('row').filter({ hasText: 'Add a dark-mode toggle' })
    await expect(row.getByRole('button', { name: 'todo#1' })).toBeVisible()
    await row.getByRole('button', { name: 'todo#1' }).click()
    const board = page.getByRole('dialog', { name: 'Todos' })
    const detail = board.getByRole('complementary', { name: 'Task detail' })
    await expect(detail).toContainText('todo#1')

    // The task says how its run stands, and a click opens that run in the Workflows window.
    const runs = detail.locator('.td-meta')
    await expect(runs).toContainText('still open')
    await runs.getByRole('button', { name: /still open/ }).click()
    await expect(page.getByRole('dialog', { name: 'Workflows' }).getByRole('region', { name: /How Add a dark-mode toggle went/ })).toBeVisible()

    // Finishing the run finishes the task the agent never closed itself.
    for (let i = 0; i < 3; i++) await call('step_done', {})
    await call('task_done', { summary: 'Toggle added.' })
    await expect.poll(() => call('todo_get', { id: '1' })).toContain('done')
    expect(await call('todo_get', { id: '1' })).toContain('Finished with its run: Toggle added.')
    await client.close()
  } finally {
    await shutdown()
  }
})
