import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const BILLING = {
  version: 1,
  id: 'billing-change',
  name: 'Billing change',
  when: 'A change touching src/billing/, including its tests.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve', brief: 'Say which billing code changes.' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass' },
    { id: 'lint', kind: 'check', name: 'Lint', run: 'npm run lint', gate: 'pass' },
    { id: 'review', kind: 'audit', name: 'Security audit' },
    { id: 'land', kind: 'merge' }
  ]
}
const BUG_FIX = {
  version: 1,
  id: 'bug-fix',
  name: 'Bug fix',
  when: 'A defect with a known symptom.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve' },
    { id: 'fix', kind: 'work', name: 'Fix, test first' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass', retries: 2 },
    { id: 'land', kind: 'merge' }
  ]
}

async function start(extra: { saved?: object; approved?: Record<string, unknown> } = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-builder-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', lint: 'eslint .' } }))
  if (extra.saved) {
    mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
    writeFileSync(join(repo, '.agent-world', 'workflows', 'bug-fix.json'), JSON.stringify(extra.saved, null, 2) + '\n')
  }
  git('add', '.')
  git('commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true } }))
  if (extra.approved) writeFileSync(join(home, 'workflow-approvals.json'), JSON.stringify({ approved: extra.approved }))
  const argsLog = join(tmp, 'args.log')
  const app = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
  const page = await app.app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { ...app, page, repo, home, argsLog, git }
}

/** What each launched agent was started with, newest launch last. */
const launches = (argsLog: string) => readFileSync(argsLog, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).filter((a) => a.includes('--settings'))
const flag = (launch: string[], f: string) => launch[launch.indexOf(f) + 1]!

async function asAgent(launch: string[]) {
  const cfg = JSON.parse(readFileSync(flag(launch, '--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers } }))
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
    return { text: r.content[0]!.text, error: r.isError === true }
  }
  return { client, call }
}

const openWorkflows = async (page: Page) => {
  await page.locator('header').getByRole('button', { name: /Workflows/ }).click()
  const win = page.getByRole('dialog', { name: 'Workflows' })
  await win.getByRole('tab', { name: 'Workflows' }).click()
  return win
}
const hashOf = (file: string) => createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex').slice(0, 16)

test('the person describes a workflow, the builder (a read-only agent in the project) proposes one through its own tools, nothing is written until a button is pressed, and saving approves its commands', async () => {
  const s = await start()
  try {
    const { page, repo, home, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('textbox', { name: 'Describe a workflow' }).fill('Every change to billing gets a security review and two approvals.')
    await win.getByRole('button', { name: 'Start with the builder' }).click()

    // The split opens with the builder's own chat, which holds what the person typed, as their words.
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const chat = win.getByRole('log', { name: 'Conversation with builder' })
    await expect(chat).toContainText('Every change to billing gets a security review and two approvals.', { timeout: 20_000 })
    expect(await chat.innerText()).not.toContain('[Agent World]')

    // It is a Claude agent in the folder itself, read-only, with the builder's instructions and tools and no task tools.
    const [builder] = await page.evaluate(() => window.aw.listAgents())
    expect(builder).toMatchObject({ name: 'builder', builder: true, cwd: repo, branch: null, options: { role: 'Workflow builder', permissionMode: 'plan', inPlace: true } })
    const launch = launches(argsLog)[0]!
    expect(flag(launch, '--permission-mode')).toBe('plan')
    expect(flag(launch, '--append-system-prompt')).toContain('You are the workflow builder')
    expect(flag(launch, '--append-system-prompt')).not.toContain('task_begin')
    const allowed = launch.slice(launch.indexOf('--allowedTools') + 1)
    expect(allowed).toEqual(expect.arrayContaining(['mcp__agent-world__workflow_list', 'mcp__agent-world__workflow_get', 'mcp__agent-world__workflow_propose']))
    expect(allowed).not.toContain('mcp__agent-world__task_begin')

    const { client, call } = await asAgent(launch)
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('task_begin')
    expect((await call('workflow_list', {})).text).toContain('- standard (built in): Standard')

    // A file with problems comes back to the builder with every problem; the person sees nothing.
    const bad = await call('workflow_propose', { file: JSON.stringify({ ...BILLING, name: '', steps: [{ id: 'tests', kind: 'check' }] }) })
    expect(bad.error).toBe(true)
    expect(bad.text).toContain('"name" is required')
    expect(bad.text).toContain('needs "run"')
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })

    // A good one shows up beside the chat, with its commands and what saving does; nothing is written yet.
    expect((await call('workflow_propose', { file: JSON.stringify(BILLING) })).text).toContain('Proposed "Billing change"')
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft).toContainText('Billing change')
    await expect(draft).toContainText('new · not saved')
    await expect(draft.getByRole('list', { name: 'Steps' })).toContainText('Security audit')
    await expect(draft.getByLabel('Commands')).toContainText('2 commands would run on your computer')
    await expect(draft.getByLabel('Commands')).toContainText('npm run lint')
    await expect(draft.getByLabel('Commands')).toContainText('Saving approves exactly these commands')
    expect(existsSync(join(repo, '.agent-world', 'workflows'))).toBe(false)

    // The person saves it to the project: the file is there, its commands are approved for exactly that file, and the list shows it.
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    const file = join(repo, '.agent-world', 'workflows', 'billing-change.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(BILLING)
    const approved = JSON.parse(readFileSync(join(home, 'workflow-approvals.json'), 'utf8')).approved as Record<string, { id: string; commands: string[] }>
    expect(approved[hashOf(file)]).toMatchObject({ id: 'billing-change', commands: ['npm test', 'npm run lint'] })
    await expect(win.getByRole('option', { name: /Billing change/ })).toHaveAttribute('aria-selected', 'true')
    await expect(win.getByRole('list', { name: 'Steps' })).toContainText('runs: npm run lint')

    // Another agent never gets the builder's tools.
    await win.getByRole('button', { name: 'Close' }).click()
    await hire(page, { name: 'ada' })
    await expect.poll(() => launches(argsLog).length, { timeout: 20_000 }).toBe(2)
    const ada = await asAgent(launches(argsLog)[1]!)
    const names = (await ada.client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('task_begin')
    expect(names).not.toContain('workflow_propose')
    expect((await ada.call('workflow_propose', { file: '{}' }).catch(() => ({ error: true }))).error).toBe(true)
    await ada.client.close()
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('editing a saved workflow: the builder starts from it, the draft says what changes and which commands are new, replacing keeps one file, and a file changed by hand since blocks the save', async () => {
  const bugFixHash = createHash('sha256').update(JSON.stringify(BUG_FIX, null, 2) + '\n').digest('hex').slice(0, 16)
  const s = await start({ saved: BUG_FIX, approved: { [bugFixHash]: { id: 'bug-fix', commands: ['npm test'], at: 1 } } })
  try {
    const { page, repo, home, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    await expect(win.getByText('editing Bug fix')).toBeVisible()
    await expect(win.getByRole('log', { name: 'Conversation with builder' })).toContainText('I want to change the workflow "bug-fix" (Bug fix).', { timeout: 20_000 })

    const { client, call } = await asAgent(launches(argsLog)[0]!)
    expect(JSON.parse((await call('workflow_get', { id: 'bug-fix' })).text)).toEqual(BUG_FIX)
    expect((await call('workflow_get', { id: 'nope' })).error).toBe(true)

    // The same file proposed back is not a proposal.
    expect((await call('workflow_propose', { file: JSON.stringify(BUG_FIX) })).text).toContain('unchanged')
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })

    const next = structuredClone(BUG_FIX)
    next.steps[2] = { ...next.steps[2]!, retries: 3 } as (typeof next.steps)[number]
    next.steps.splice(3, 0, { id: 'lint', kind: 'check', name: 'Lint', run: 'npm run lint', gate: 'pass' } as (typeof next.steps)[number])
    await call('workflow_propose', { file: JSON.stringify(next) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft).toContainText('replaces the one in this project')
    const diff = draft.getByRole('list', { name: 'What changes' })
    await expect(diff).toContainText('+ Lint')
    await expect(diff).toContainText('runs: npm run lint')
    await expect(diff).toContainText('~ Tests pass · retries 2 → 3')
    await expect(diff).toContainText('3 steps unchanged')
    // npm test was approved for an earlier version; npm run lint is the news.
    await expect(draft.getByLabel('Commands')).toContainText('2 commands would run on your computer')
    await expect(draft.getByLabel('Commands')).toContainText('1 new')
    await expect(draft.getByLabel('Commands').locator('li', { hasText: 'npm test' })).toContainText('approved before')
    await expect(draft.getByLabel('Commands').locator('li', { hasText: 'npm run lint' })).not.toContainText('approved before')

    // Replacing writes over the same file; there is still one, and the new version's commands are approved.
    await draft.getByRole('button', { name: 'Replace Bug fix in shop' }).click()
    const dir = join(repo, '.agent-world', 'workflows')
    await expect.poll(() => (JSON.parse(readFileSync(join(dir, 'bug-fix.json'), 'utf8')) as typeof BUG_FIX).steps.length).toBe(5)
    expect(readdirSync(dir)).toEqual(['bug-fix.json'])
    const approved = JSON.parse(readFileSync(join(home, 'workflow-approvals.json'), 'utf8')).approved as Record<string, { commands: string[] }>
    expect(approved[hashOf(join(dir, 'bug-fix.json'))]!.commands).toEqual(['npm test', 'npm run lint'])

    // A later proposal against a file the person then edited by hand cannot be saved over it.
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    await call('workflow_propose', { file: JSON.stringify({ ...next, name: 'Fix a bug' }) })
    await expect(win.getByRole('region', { name: 'Workflow proposal' })).toContainText('Fix a bug')
    writeFileSync(join(dir, 'bug-fix.json'), JSON.stringify({ ...next, name: 'Edited by hand' }, null, 2) + '\n')
    await win.getByRole('button', { name: 'Replace Fix a bug in shop' }).click()
    await expect(win.getByRole('alert').filter({ hasText: 'changed since' })).toBeVisible()
    expect((JSON.parse(readFileSync(join(dir, 'bug-fix.json'), 'utf8')) as { name: string }).name).toBe('Edited by hand')
    await win.getByRole('button', { name: 'Discard' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    await client.close()
  } finally {
    await s.shutdown()
  }
})
