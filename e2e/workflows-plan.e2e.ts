import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'
import { shot } from './wf-helpers'

const BAD = '## Goal\nAdd a toggle.\n'
const GOOD = `## Goal
Add a dark-mode toggle to Settings, as in docs/mock.html and https://example.com/spec (not in src/nowhere.ts).

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

    await expect.poll(() => readLog(argsLog).includes('--settings')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
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
    mkdirSync(join(ada!.cwd, 'docs'), { recursive: true })
    writeFileSync(join(ada!.cwd, 'docs', 'mock.html'), '<h1>mock</h1>')
    expect(text(await client.callTool({ name: 'plan_submit', arguments: {} }))).toContain('1 open question')
    expect(await (await edit('src/a.ts')).json()).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: expect.stringContaining('waiting') } })
    // A path that leads out of the worktree is refused.
    expect(failed(await client.callTool({ name: 'plan_submit', arguments: { path: '../outside.md' } }))).toBe(true)

    // The agent is idle (its turn ended), so the person's answer can be typed into it.
    await post({ hook_event_name: 'Stop' })

    // The panel is in the chat: the read-back, the question as choices, approval blocked until it is answered.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Add a dark-mode toggle to Settings')
    // What the agent wrote is read as in the chat: the path of a real file and an address are links, a path that is no file here stays as written.
    const fileLink = panel.locator('a.file-link', { hasText: 'mock.html' })
    await expect(fileLink).toBeVisible()
    await expect(panel.locator('a[href="https://example.com/spec"]')).toHaveCount(1)
    await expect(panel).toContainText('src/nowhere.ts')
    await expect(panel.locator('a', { hasText: 'nowhere' })).toHaveCount(0)
    await shot(panel, 'plan-gate-links')
    await fileLink.click()
    await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: 'Chat' }).click()
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
        line({ k: 'begin', t, run: 'r1', agent: ada!.id, name: 'ada', project: repo, title: 'Add a toggle', workflow: { id: 'standard', name: 'Standard', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'approve' }] } }),
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
    await expect(page.getByRole('region', { name: /where ada is/ }).first()).toContainText('plan sent back: being revised')
    // The hold can always be lifted from the app: a release needs no waiting plan.
    await page.evaluate(() => window.aw.workflows.decide('r1', 'released'))
    expect((await page.evaluate(() => window.aw.workflows.summary())).runs[0]!.rounds[0]!.plan).toMatchObject({ state: 'released' })
  } finally {
    await shutdown()
  }
})

test('the dial changes what task_begin tells the agent: at economy a small change may skip the plan and edits are not held, at balanced the plan is asked for', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfdial-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'economy', since: 1, planGate: true, mergeGate: true } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50' }, tmp)
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
    const edit = () => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(ada!.cwd, 'src/a.ts'), old_string: 'a', new_string: 'b' } }) }).then((r) => r.text())
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const begin = async (title: string) => ((await client.callTool({ name: 'task_begin', arguments: { title } })) as { content: { text: string }[] }).content[0]!.text

    // Economy: the instruction offers the skip, and with no plan submitted nothing is held.
    expect(await begin('Fix a typo')).toContain('If the whole change can be said in one sentence, skip the plan')
    expect(await edit()).toBe('')

    // The person moves the dial to Balanced in Settings: the next task is asked for a plan, every time.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Features' }).click()
    await settings.getByRole('radio', { name: 'Balanced' }).click()
    await expect(settings.getByRole('radio', { name: 'Balanced' })).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => JSON.parse(readFileSync(join(tmp, 'home', 'preferences.json'), 'utf8')).workflows.dial).toBe('balanced')
    const later = await begin('Add a dark-mode toggle')
    expect(later).toContain('.agent-world/plan.md')
    expect(later).not.toContain('one sentence')
    expect(await (await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(ada!.cwd, 'src/a.ts'), old_string: 'a', new_string: 'b' } }) })).json()).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    await client.close()
  } finally {
    await shutdown()
  }
})

test('a plan with no open questions says so, and the person can still add a note, which reaches the agent with the approval', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfplan-note-')))
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
    await expect.poll(() => readLog(argsLog).includes('--settings')).toBe(true)
    const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const flag = (f: string) => launch[launch.indexOf(f) + 1]!
    const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } })
    mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), GOOD.replace(/## Open questions[\s\S]*## Steps/, '## Open questions\nnone\n\n## Steps'))
    await client.callTool({ name: 'plan_submit', arguments: {} })
    await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'Stop' }) })

    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('ada asked no questions.')
    await panel.getByRole('button', { name: '＋ Add a note for ada' }).click()
    await panel.getByLabel('A note for ada').fill('Keep it behind a flag.')
    await panel.getByRole('button', { name: 'Approve plan' }).click()
    await expect(panel).toBeHidden()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Your plan was approved', { timeout: 15_000 })
    await expect(log).toContainText('Their note: Keep it behind a flag.')
    await client.close()
  } finally {
    await shutdown()
  }
})
