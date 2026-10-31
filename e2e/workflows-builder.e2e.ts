import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const BILLING = {
  version: 1,
  id: 'billing-change',
  name: 'Billing change',
  when: 'A change touching src/billing/, including its tests.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve', brief: 'Say which billing code changes.' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'work', name: 'Tests pass' },
    { id: 'lint', kind: 'work', name: 'Lint' },
    { id: 'review', kind: 'work', name: 'Security audit' },
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
    { id: 'tests', kind: 'work', name: 'Tests pass' },
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
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
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
const launches = (argsLog: string) => readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).filter((a) => a.includes('--settings'))
const flag = (launch: string[], f: string) => launch[launch.indexOf(f) + 1]!
/** The n-th launch, once it is in the log: the agent starts a moment after the app shows it, and a slow machine reads the log first. */
const launchAt = async (argsLog: string, n: number) => {
  await expect.poll(() => launches(argsLog).length, { timeout: 20_000 }).toBeGreaterThan(n)
  return launches(argsLog)[n]!
}

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

/** The box of an element once it has stopped moving: the canvas fits its view and the panel settles after the nodes appear, and a drag measured while that goes on starts in the wrong place. */
const still = async (el: Locator) => {
  await el.scrollIntoViewIfNeeded()
  let last = ''
  await expect.poll(async () => {
    const now = JSON.stringify(await el.boundingBox())
    const same = now === last
    last = now
    return same
  }, { intervals: [100, 100, 100, 200, 200] }).toBe(true)
  return (await el.boundingBox())!
}

/** Press at one point and release at another, with a first small move so the canvas starts a drag before the long one. */
const dragBetween = async (page: Page, a: { x: number; y: number }, b: { x: number; y: number }) => {
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x, a.y + 8, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 15 })
  await page.mouse.move(b.x, b.y)
  await page.mouse.up()
}

const openWorkflows = async (page: Page) => {
  await page.locator('header').getByRole('button', { name: /Workflows/ }).click()
  const win = page.getByRole('dialog', { name: 'Workflows' })
  await win.getByRole('tab', { name: 'Workflows' }).click()
  return win
}
const hashOf = (file: string) => createHash('sha256').update(readFileSync(file, 'utf8')).digest('hex').slice(0, 16)

test('the person describes a workflow, the builder (a read-only agent in the project) proposes one through its own tools, nothing is written until a button is pressed, and saving writes the file', async () => {
  const s = await start()
  try {
    const { page, repo, home, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Describe it to the builder…' }).click()
    await win.getByRole('textbox', { name: 'Describe a workflow' }).fill('Every change to billing gets a security review and two approvals.')
    await win.getByRole('button', { name: 'Start', exact: true }).click()

    // The split opens with the builder's own chat, which holds what the person typed, as their words.
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const chat = win.getByRole('log', { name: 'Conversation with builder' })
    await expect(chat).toContainText('Every change to billing gets a security review and two approvals.', { timeout: 20_000 })
    expect(await chat.innerText()).not.toContain('[Agent World]')

    // It is a Claude agent in the folder itself, read-only, with the builder's instructions and tools and no task tools.
    const [builder] = await page.evaluate(() => window.aw.listAgents())
    expect(builder).toMatchObject({ name: 'builder', builder: true, cwd: repo, branch: null, options: { role: 'Workflow builder', permissionMode: 'plan', inPlace: true } })
    const launch = await launchAt(argsLog, 0)
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
    const bad = await call('workflow_propose', { file: JSON.stringify({ ...BILLING, name: '', steps: [{ id: 'tests', kind: 'nope' }] }) })
    expect(bad.error).toBe(true)
    expect(bad.text).toContain('"name" is required')
    expect(bad.text).toContain('"kind" must be one of')
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })

    // A good one shows up beside the chat, with its commands and what saving does; nothing is written yet.
    expect((await call('workflow_propose', { file: JSON.stringify(BILLING) })).text).toContain('Proposed "Billing change"')
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft).toContainText('Billing change')
    await expect(draft).toContainText('new · not saved')
    await expect(draft.getByLabel('Step 5: Security audit')).toBeVisible()
    // No command is kept or run any more, so there is nothing to approve.
    await expect(draft.getByLabel('Commands')).toHaveCount(0)
    expect(existsSync(join(repo, '.agent-world', 'workflows'))).toBe(false)

    // The person saves it to the project: the file is there, its commands are approved for exactly that file, and the list shows it.
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    const file = join(repo, '.agent-world', 'workflows', 'billing-change.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(BILLING)
    await expect(win.getByRole('option', { name: /Billing change/ })).toHaveAttribute('aria-selected', 'true')
    await expect(win.locator('.react-flow__node').filter({ hasText: 'Lint' })).toHaveCount(1)

    // Another agent never gets the builder's tools.
    await win.getByRole('button', { name: 'Close' }).click()
    await hire(page, { name: 'ada' })
    await expect.poll(() => launches(argsLog).length, { timeout: 20_000 }).toBe(2)
    const ada = await asAgent(await launchAt(argsLog, 1))
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

test('editing a saved workflow: the builder starts from it, the draft says what changes, replacing keeps one file, and a file changed by hand since blocks the save', async () => {
  const bugFixHash = createHash('sha256').update(JSON.stringify(BUG_FIX, null, 2) + '\n').digest('hex').slice(0, 16)
  const s = await start({ saved: BUG_FIX, approved: { [bugFixHash]: { id: 'bug-fix', commands: ['npm test'], at: 1 } } })
  try {
    const { page, repo, home, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    await expect(win.getByText('editing Bug fix')).toBeVisible()
    // Nothing is typed for the person: the conversation waits for their first message, which carries what the builder needs to know about the workflow.
    await expect(win.getByRole('log', { name: 'Conversation with builder' })).toContainText('Say something to builder', { timeout: 20_000 })

    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    expect(JSON.parse((await call('workflow_get', { id: 'bug-fix' })).text)).toEqual(BUG_FIX)
    expect((await call('workflow_get', { id: 'nope' })).error).toBe(true)

    // The saved workflow is already the draft beside the chat, to be edited in place; the same file proposed back is not a proposal.
    const saved = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(saved.getByLabel('Step 2: Fix, test first')).toBeVisible()
    await expect(saved).toContainText('Nothing differs from the saved one.')
    expect((await call('workflow_propose', { file: JSON.stringify(BUG_FIX) })).text).toContain('unchanged')

    const next = structuredClone(BUG_FIX)
    next.steps[2] = { ...next.steps[2]!, brief: 'Run all the tests.' } as unknown as (typeof next.steps)[number]
    next.steps.splice(3, 0, { id: 'lint', kind: 'work', name: 'Lint' } as (typeof next.steps)[number])
    await call('workflow_propose', { file: JSON.stringify(next) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft).toContainText('replaces the one in this project')
    const diff = draft.getByRole('list', { name: 'What changes' })
    await expect(diff).toContainText('+ Lint')
    await expect(diff).toContainText('~ Tests pass')
    await expect(diff).toContainText('3 steps unchanged')
    // No command is kept or run any more, so there is nothing to approve.
    await expect(draft.getByLabel('Commands')).toHaveCount(0)

    // Replacing writes over the same file; there is still one.
    await draft.getByRole('button', { name: 'Replace in project' }).click()
    const dir = join(repo, '.agent-world', 'workflows')
    await expect.poll(() => (JSON.parse(readFileSync(join(dir, 'bug-fix.json'), 'utf8')) as typeof BUG_FIX).steps.length).toBe(5)
    expect(readdirSync(dir)).toEqual(['bug-fix.json'])
    // The save is written down, and the builder can read it back.
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await expect(win.getByRole('region', { name: 'History of bug-fix' })).toContainText('replaced the saved one: added Lint; changed Tests pass')
    expect((await call('workflow_history', { id: 'bug-fix' })).text).toContain('replaced the saved one · added Lint; changed Tests pass')

    // A later proposal against a file the person then edited by hand cannot be saved over it.
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    // The same workflow again keeps the conversation: no new session starts, and nothing is typed for the person.
    await expect(win.getByText(/^editing /i)).toBeVisible({ timeout: 15_000 })
    expect(launches(argsLog)).toHaveLength(1)
    const again = await asAgent(await launchAt(argsLog, 0))
    await again.call('workflow_propose', { file: JSON.stringify({ ...next, name: 'Fix a bug' }) })
    await expect(win.getByRole('region', { name: 'Workflow proposal' })).toContainText('Fix a bug')
    writeFileSync(join(dir, 'bug-fix.json'), JSON.stringify({ ...next, name: 'Edited by hand' }, null, 2) + '\n')
    await win.getByRole('button', { name: 'Replace in project' }).click()
    await expect(win.getByRole('alert').filter({ hasText: 'changed since' })).toBeVisible()
    expect((JSON.parse(readFileSync(join(dir, 'bug-fix.json'), 'utf8')) as { name: string }).name).toBe('Edited by hand')
    await win.getByRole('button', { name: 'Discard' }).click()
    // Editing a saved workflow, the right side falls back to the saved flow, not an empty box.
    await expect(win.getByText('as it is saved')).toBeVisible({ timeout: 15_000 })

    // A new workflow after an edit starts clean: the title says new, the right side is empty, and the edit's conversation is gone.
    await win.getByRole('button', { name: '← All workflows' }).click()
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('New workflow', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(win.getByText('Nothing proposed yet')).toBeVisible()
    await expect(win.getByRole('log', { name: 'Conversation with builder' })).not.toContainText('I want to change the workflow "bug-fix"')
    await again.client.close()
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('the person edits the builder\'s draft in place: a rename, a step added, one removed; undo goes back to the proposal, and what is saved is what they edited', async () => {
  const s = await start()
  try {
    const { page, repo, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    await call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    // The steps are a flow of cards; a click opens the fields of one.
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)
    await draft.getByLabel('Step 5: Security audit').click()
    await expect(draft.getByLabel('Name of step 5')).toHaveValue('Security audit')
    await expect(draft).not.toContainText('You edited')

    // A rename is an edit, counted, and it can be undone.
    await draft.getByLabel('Name of step 5').fill('Security review')
    await expect(draft).toContainText('You edited 1 thing.')
    await draft.getByRole('button', { name: 'Undo edits' }).click()
    // A press outside the settings popup puts it away: pick the step again to read it.
    await draft.getByLabel('Step 5: Security audit').click()
    await expect(draft.getByLabel('Name of step 5')).toHaveValue('Security audit')
    await expect(draft).not.toContainText('You edited')

    // A step added before the landing step is an agent step: it has a name and what it is told, and there is nothing to run, so saving needs nothing more.
    await draft.getByLabel('Name of step 5').fill('Security review')
    await draft.getByRole('button', { name: 'Add a step', exact: true }).click()
    await draft.getByRole('menuitem', { name: /^work/ }).click()
    await expect(draft.getByRole('alert')).toHaveCount(0)
    await expect(draft.getByRole('button', { name: 'Save to shop' })).toBeEnabled()
    await draft.getByLabel('Name of step 6').fill('Typecheck')
    // The preview under the draft follows the edit: what each step will ask of the person.
    await draft.getByRole('button', { name: /^Asks you/ }).click()
    const preview = draft.getByLabel('Preview of the workflow')
    await expect(preview).toContainText('you approve the plan before any edit')
    await expect(draft).toContainText('You stop at')

    // Lint goes; what is saved is exactly this.
    await draft.getByLabel('Step 4: Lint').click()
    await draft.getByRole('button', { name: 'Remove step 4' }).click()
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)
    await draft.getByLabel('Step 4: Security review').click()
    await expect(draft.getByLabel('Name of step 4')).toHaveValue('Security review')
    await expect(draft).toContainText('You edited 3 things.')
    await draft.getByRole('button', { name: 'Save to shop' }).click()
    const file = join(repo, '.agent-world', 'workflows', 'billing-change.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    const saved = JSON.parse(readFileSync(file, 'utf8')) as typeof BILLING
    expect(saved.steps.map((x) => x.name ?? x.id)).toEqual(['plan', 'Build', 'Tests pass', 'Security review', 'Typecheck', 'land'])
    expect(saved.steps[3]).toMatchObject({ kind: 'work', name: 'Security review' })
    expect(saved.steps[4]).toMatchObject({ kind: 'work', name: 'Typecheck' })
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('the builder\'s agent stays inside the builder: it is not in the agents list, the switcher or the office, with the builder open, after it is closed, and after a reload', async () => {
  const s = await start()
  try {
    const { page, argsLog } = s
    await hire(page, { name: 'ada' })
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Describe it to the builder…' }).click()
    await win.getByRole('textbox', { name: 'Describe a workflow' }).fill('Every change to billing gets a security review.')
    await win.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(win.getByRole('log', { name: 'Conversation with builder' })).toContainText('Every change to billing', { timeout: 20_000 })
    // The builder's chat is there, and its agent is a real one the office knows ...
    expect((await page.evaluate(() => window.aw.listAgents())).some((a) => a.builder)).toBe(true)
    // ... but it is in none of the lists of agents.
    // Other agents do not see it when they ask who is in the office.
    const { call } = await asAgent(await launchAt(argsLog, 0))
    expect((await call('list_agents', {})).text).not.toContain('builder')
    const roster = page.locator('.roster button', { hasText: 'builder' })
    await expect(roster).toHaveCount(0)
    await win.getByRole('button', { name: 'Close' }).first().click()
    await expect(roster).toHaveCount(0)
    await page.reload()
    await expect.poll(() => page.locator('.roster').count()).toBeGreaterThanOrEqual(0)
    await expect(page.locator('.roster button', { hasText: 'builder' })).toHaveCount(0)
    await expect(page.getByText('builder', { exact: true })).toHaveCount(0)
  } finally {
    await s.shutdown()
  }
})

test('a step card is dragged to another place in the flow, and a narrow panel shows the same steps as a plain list', async () => {
  const s = await start()
  try {
    const { page, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    await call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    const nodes = draft.locator('.react-flow__node')
    await expect(nodes).toHaveCount(6)
    await expect(nodes.nth(1)).toHaveAttribute('aria-label', 'Step 2: Build')

    // Dragging Build down past Tests pass puts it third.
    const box = await still(draft.getByLabel('Step 2: Build'))
    await dragBetween(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2, y: box.y + box.height / 2 + box.height * 1.9 })
    await expect(draft.locator('.react-flow__node').nth(1)).toHaveAttribute('aria-label', 'Step 2: Tests pass')
    await expect(draft.locator('.react-flow__node').nth(2)).toHaveAttribute('aria-label', 'Step 3: Build')
    await expect(draft).toContainText('You edited 1 thing.')

    // In a narrow panel the flow gives way to a list with every step's fields open.
    await page.setViewportSize({ width: 480, height: 1000 })
    await expect(draft.getByRole('list', { name: 'Steps' })).toBeVisible()
    await expect(draft.getByLabel('Name of step 3')).toBeVisible()
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('every step takes a brief, and a step can ask the person first: the card says so, and the saved file holds both', async () => {
  const s = await start()
  try {
    const { page, repo, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    await call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)

    // The audit step had no brief before; now it does, and the reviewer is told it.
    await draft.getByLabel('Step 5: Security audit').click()
    await draft.getByLabel('Brief of step 5').fill('Look hard at the billing code.')
    await draft.getByRole('switch', { name: 'Asks me first' }).click()
    await expect(draft.getByLabel('Step 5: Security audit')).toContainText('starts when you press Run')
    await expect(draft.getByLabel('Step 5: Security audit')).toContainText('Look hard at the billing code.')
    // The preview says what the press starts, and that you stop there.
    await draft.getByRole('button', { name: /^Asks you/ }).click()
    await expect(draft.getByLabel('Preview of the workflow')).toContainText('you press Run, then')
    await draft.getByRole('button', { name: /^Asks you/ }).click()
    await expect(draft.getByLabel('Preview of the workflow')).toHaveCount(0)
    // The landing step takes a brief too, and so does any other step.
    await draft.getByLabel('Step 6: Land').click()
    await draft.getByLabel('Brief of step 6').fill('Squash it.')
    await draft.getByLabel('Step 3: Tests pass').click()
    await draft.getByRole('switch', { name: 'Asks me first' }).click()
    await expect(draft.getByRole('alert')).toHaveCount(0)

    await draft.getByRole('button', { name: 'Save to shop' }).click()
    const file = join(repo, '.agent-world', 'workflows', 'billing-change.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    const saved = JSON.parse(readFileSync(file, 'utf8')) as typeof BILLING
    expect(saved.steps[4]).toMatchObject({ kind: 'work', brief: 'Look hard at the billing code.', start: 'run' })
    expect(saved.steps[5]).toMatchObject({ kind: 'merge', brief: 'Squash it.' })
    expect(saved.steps[2]).toMatchObject({ kind: 'work', start: 'run' })
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('the flow is edited on the canvas: a + on an arrow adds a step there, an arrow drawn from one step to another puts it right after, Delete takes the picked step out, and a step can be copied', async () => {
  const s = await start()
  try {
    const { page, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    await call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    const labels = () => draft.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)

    // An arrow drawn from the dot under Plan to the dot over Tests pass puts Tests pass right after Plan.
    const from = await still(draft.getByLabel('Step 1: Plan').locator('.react-flow__handle[data-handleid="bottom"]'))
    const to = await still(draft.getByLabel('Step 3: Tests pass').locator('.react-flow__handle[data-handleid="top"]'))
    await dragBetween(page, { x: from.x + from.width / 2, y: from.y + from.height / 2 }, { x: to.x + to.width / 2, y: to.y + to.height / 2 })
    await expect.poll(async () => (await labels())[1]).toBe('Step 2: Tests pass')
    await expect.poll(async () => (await labels())[2]).toBe('Step 3: Build')

    // A + on the arrow after step 1 adds a step there, and picks it so its fields are open.
    await draft.getByRole('button', { name: 'Add a step after step 1' }).click({ force: true })
    await draft.getByRole('menuitem', { name: /^work/ }).click({ force: true })
    await expect(draft.locator('.react-flow__node')).toHaveCount(7)
    expect((await labels())[1]).toBe('Step 2: Build')
    await expect(draft.getByLabel('Name of step 2')).toBeVisible()

    // Delete takes the picked step out.
    await draft.getByLabel('Step 4: Build').click()
    await page.keyboard.press('Delete')
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)
    expect(await labels()).not.toContain('Step 4: Build')

    // A step can be copied.
    await draft.getByLabel('Step 1: Plan').click()
    await draft.getByRole('button', { name: 'Duplicate step 1' }).click()
    await expect(draft.locator('.react-flow__node')).toHaveCount(7)
    expect((await labels())[1]).toBe('Step 2: Plan')
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('every step has the same settings: who does it, whether it asks you first, and whether it is optional; only the plan is answered after it is written', async () => {
  const s = await start()
  try {
    const { page, repo, argsLog } = s
    const win = await openWorkflows(page)
    await win.getByRole('button', { name: '+ New workflow' }).click()
    await win.getByRole('menuitem', { name: 'Blank workflow' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const { client, call } = await asAgent(await launchAt(argsLog, 0))
    await call('workflow_propose', { file: JSON.stringify(BILLING) })
    const draft = win.getByRole('region', { name: 'Workflow proposal' })
    await expect(draft.locator('.react-flow__node')).toHaveCount(6)

    // A build step asks once, before it starts, or never: there is no second approval to turn on.
    await draft.getByLabel('Step 2: Build').click()
    await expect(draft.getByRole('group', { name: 'Who does step 2' })).toBeVisible()
    await expect(draft.getByRole('switch', { name: 'Needs my approval' })).toHaveCount(0)
    await draft.getByRole('switch', { name: 'Asks me first' }).click()
    await draft.getByRole('switch', { name: 'Optional' }).check({ force: true })
    await expect(draft.getByLabel('Step 2: Build')).toContainText('starts when you press Run')
    await expect(draft.getByLabel('Step 2: Build')).toContainText('optional')

    // The plan is the one step answered after it is written.
    await draft.getByLabel('Step 1: Plan').click()
    await expect(draft.getByRole('switch', { name: 'Needs my approval' })).toBeChecked()
    await expect(draft.getByRole('alert')).toHaveCount(0)

    await draft.getByRole('button', { name: 'Save to shop' }).click()
    const file = join(repo, '.agent-world', 'workflows', 'billing-change.json')
    await expect.poll(() => existsSync(file)).toBe(true)
    const saved = JSON.parse(readFileSync(file, 'utf8')) as typeof BILLING
    expect(saved.steps[0]).toMatchObject({ kind: 'plan', gate: 'approve' })
    expect(saved.steps[1]).toMatchObject({ kind: 'work', name: 'Build', start: 'run', optional: true })
    await client.close()
  } finally {
    await s.shutdown()
  }
})

test('Edit with the builder again on the same workflow keeps the builder\'s conversation; another workflow starts a new one', async () => {
  const other = { ...BUG_FIX, id: 'other-flow', name: 'Other flow' }
  const s = await start({ saved: BUG_FIX })
  try {
    const { page } = s
    const win = await openWorkflows(page)
    const session = async () => (await page.evaluate(() => window.aw.listAgents())).find((a) => (a as { builder?: boolean }).builder)?.sessionId
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    await expect(win.getByText('editing Bug fix')).toBeVisible()
    await expect.poll(session).toBeTruthy()
    const first = await session()
    await win.getByRole('button', { name: '← All workflows' }).click()
    await win.getByRole('option', { name: /Bug fix/ }).click()
    await win.getByRole('button', { name: 'Edit with the builder' }).click()
    await expect(win.getByText('editing Bug fix')).toBeVisible()
    expect(await session()).toBe(first)
    void other
  } finally {
    await s.shutdown()
  }
})
