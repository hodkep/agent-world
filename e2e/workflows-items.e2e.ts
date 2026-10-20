import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

test('more work asked for while a run is open is an item of that run, not another run: one track, the agent is told to re-submit its plan, the tab lists the items, and a task begun after done is a new run', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfitems-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    await expect.poll(() => readLog(argsLog).includes('--mcp-config')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
    const mcpCfg = JSON.parse(readFileSync(launch[launch.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
    const runs = () => page.evaluate(() => window.aw.workflows.summary()).then((s) => s.runs)

    expect(text(await client.callTool({ name: 'task_begin', arguments: { title: 'Fix the old-side numbers' } }))).toContain('Task begun')
    const first = (await runs())[0]!
    await page.evaluate((id) => window.aw.workflows.decide(id, 'released'), first.id)

    // The second request is an item of the same run, and the agent is told to rewrite its plan to cover it.
    const added = text(await client.callTool({ name: 'task_begin', arguments: { title: 'Fold unchanged code' } }))
    expect(added).toContain('Added to the task in progress: Fold unchanged code')
    expect(added).toContain('item 2')
    expect(added).toContain('plan_submit')
    expect(await runs()).toHaveLength(1)
    expect((await runs())[0]).toMatchObject({ status: 'open', title: 'Fix the old-side numbers', items: [{ title: 'Fold unchanged code' }] })

    await page.getByRole('tab', { name: /^Workflow/ }).click()
    const items = page.getByRole('list', { name: 'Items of this run' })
    await expect(items.getByRole('listitem')).toHaveText([/Fix the old-side numbers/, /Fold unchanged code.*added/])

    // Once the task is done, the next request is a run of its own.
    await client.callTool({ name: 'task_done', arguments: { summary: 'Done.' } })
    expect(text(await client.callTool({ name: 'task_begin', arguments: { title: 'A later task' } }))).toContain('Task begun')
    expect(await runs()).toHaveLength(2)
  } finally {
    await shutdown()
  }
})
