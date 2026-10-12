import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const BAD = '## Goal\nAdd a toggle.\n'
const GOOD = `## Goal
Add a dark-mode toggle to Settings.

## Assumptions
- [given] The toggle lives in Settings.
- [guessed] The choice is saved in preferences.json.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window

## Steps
1. Add the setting.
`

test('the plan gate end to end: task_begin asks for a plan, plan_submit checks it, edits are held back, the person answers in the chat, and the answer reaches the agent', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfplan-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())

    await expect.poll(() => readFileSync(argsLog, 'utf8').includes('--settings')).toBe(true)
    const launch = readFileSync(argsLog, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const flag = (f: string) => launch[launch.indexOf(f) + 1]!
    const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
    const session_id = flag('--session-id')
    const post = (body: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id, cwd: ada!.cwd, ...body }) })
    const edit = (file: string) => post({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(ada!.cwd, file), old_string: 'a', new_string: 'b' } })
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
    const failed = (r: unknown) => (r as { isError?: boolean }).isError === true

    // Nothing is held back before a task is begun.
    expect((await (await edit('src/a.ts')).text())).toBe('')

    // task_begin asks for a plan, and from then on edits are refused, except the plan's own folder.
    const begun = text(await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } }))
    expect(begun).toContain('.agent-world/plan.md')
    expect(await (await edit('src/a.ts')).json()).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('plan') } })
    expect(await (await edit('.agent-world/plan.md')).text()).toBe('')

    // plan_submit: no file, then an incomplete one (every problem named), then a good one.
    const none = await client.callTool({ name: 'plan_submit', arguments: {} })
    expect(failed(none)).toBe(true)
    expect(text(none)).toContain('no plan at')
    mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), BAD)
    const refused = await client.callTool({ name: 'plan_submit', arguments: {} })
    expect(failed(refused)).toBe(true)
    expect(text(refused)).toContain('Missing "## Assumptions"')
    expect(text(refused)).toContain('Missing "## Out of scope"')
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), GOOD)
    expect(text(await client.callTool({ name: 'plan_submit', arguments: {} }))).toContain('1 open question')
    expect(await (await edit('src/a.ts')).json()).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('waiting') } })
    // A path that leads out of the worktree is refused.
    expect(failed(await client.callTool({ name: 'plan_submit', arguments: { path: '../outside.md' } }))).toBe(true)

    // The agent is idle (its turn ended), so the person's answer can be typed into it.
    await post({ hook_event_name: 'Stop' })

    // The panel is in the chat: the read-back, the question as choices, approval blocked until it is answered.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Add a dark-mode toggle to Settings.')
    await expect(panel).toContainText('The choice is saved in preferences.json.')
    await expect(panel).toContainText('A theme per project.')
    await expect(page.locator('header').getByRole('button', { name: /Workflows/ })).toBeVisible()
    const approve = panel.getByRole('button', { name: 'Approve plan' })
    await expect(approve).toBeDisabled()
    await expect(panel).toContainText('1 open question block')
    await panel.getByRole('radio', { name: 'Every window' }).click()
    await expect(approve).toBeEnabled()
    await approve.click()
    await expect(panel).toBeHidden()

    // The answer reached the agent, and the hold is lifted.
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Your plan was approved', { timeout: 15_000 })
    await expect(log).toContainText('Should the choice apply to every window')
    expect(await (await edit('src/a.ts')).text()).toBe('')
    const [run] = (await page.evaluate(() => window.aw.workflows.summary())).runs
    expect(run!.rounds[0]!.plan).toMatchObject({ state: 'approved', answers: [{ answer: 'Every window' }] })
    await client.close()
  } finally {
    await shutdown()
  }
})

test('the hold can be lifted without approving, and a plan sent back keeps the hold until it is approved', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfplan2-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true } }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_DELAY_MS: '50' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await hire(page, { name: 'ada' })
    const [ada] = await page.evaluate(() => window.aw.listAgents())
    const t = Date.now()
    const line = (o: object) => JSON.stringify(o)
    writeFileSync(
      join(tmp, 'home', 'runs.jsonl'),
      [
        line({ k: 'begin', t, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a toggle' }),
        line({ k: 'plan', t: t + 1, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a toggle.', assumptions: [], outOfScope: [], questions: [] } })
      ].join('\n') + '\n'
    )
    await page.reload()
    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Add a toggle.')
    // Sent back: the panel goes, the plan is marked sent back, and the hold stays.
    await panel.getByRole('button', { name: 'Request changes' }).click()
    await panel.getByLabel('What should change?').fill('Also cover the settings page.')
    await panel.getByRole('button', { name: 'Send back' }).click()
    await expect(panel).toBeHidden()
    expect((await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.rounds[0]!.plan).toMatchObject({ state: 'changes', note: 'Also cover the settings page.' })
    await page.getByRole('tab', { name: /^Workflow/ }).click()
    await expect(page.getByRole('region', { name: 'Round 1' })).toContainText('Plan sent back')
    // The hold can always be lifted from the app: a release needs no waiting plan.
    await page.evaluate(() => window.aw.workflows.decide('r1', 'released'))
    expect((await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.rounds[0]!.plan).toMatchObject({ state: 'released' })
  } finally {
    await shutdown()
  }
})
