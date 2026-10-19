import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { chatTab, launchApp } from './launch'

const fakeAgy = resolve(__dirname, 'fake-agy.mjs')
const FINDINGS = JSON.stringify({ findings: [{ kind: 'out-of-scope', file: 'src/theme.ts', text: 'Adds a project key; the plan puts a theme per project out of scope.' }] })

async function office(name: string, o: { dial: string; env?: Record<string, string> }) {
  const tmp = mkdtempSync(join(tmpdir(), `aw-${name}-`))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'agy'), { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: o.dial, since: 1, planGate: true, mergeGate: true } }))
  const auditLog = join(tmp, 'audit.log')
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: fakeAgy, AW_AGY_HOME: join(home, 'agy'), FAKE_DELAY_MS: '100', FAKE_AUDIT_LOG: auditLog, FAKE_ENV_FILE: envFile, ...o.env }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { tmp, repo, home, git, page, shutdown, auditLog, envFile }
}

async function hireAgy(page: Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

test('an agy agent\'s branch is audited too: the question goes to agy, on its small model at balanced, and its tokens are shown in place of dollars', async () => {
  const o = await office('wfagy', { dial: 'balanced', env: { FAKE_AUDIT: FINDINGS } })
  try {
    await hireAgy(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    expect(ada).toMatchObject({ name: 'ada', provider: 'agy' })
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    o.git(ada!.cwd, 'add', '-A')
    o.git(ada!.cwd, 'commit', '-qm', 'add toggle')
    const t = Date.now()
    appendFileSync(join(o.home, 'runs.jsonl'), [
      { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: o.repo, title: 'Add a dark-mode toggle' },
      { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
      { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
    ].map((e) => JSON.stringify(e)).join('\n') + '\n')

    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    // The agent never reported its work here, so the audit has not started by itself.
    await dialog.getByRole('button', { name: 'Run the audit now' }).click()
    await expect(dialog.getByRole('list', { name: 'What the audit found' })).toContainText('Adds a project key', { timeout: 20_000 })
    await expect(dialog.getByRole('group', { name: 'Against the plan' })).toContainText('gemini-3.8-flash-low · about 17k tokens')
    expect(dialog).not.toContainText('not available for this program')
    const asked = JSON.parse(readFileSync(o.auditLog, 'utf8').trim().split('\n')[0]!) as { prompt: string; model: string }
    expect(asked.model).toBe('gemini-3.8-flash-low')
    expect(asked.prompt).toContain('Add a dark-mode toggle to Settings.')
    expect(asked.prompt).toContain('+export const dark = true')
  } finally {
    await o.shutdown()
  }
})

test('at max the audit of an agy agent uses agy\'s large model, and an agy that fails says why without holding Land', async () => {
  const o = await office('wfagy2', { dial: 'max', env: { FAKE_AUDIT_FAIL: 'Quota exhausted' } })
  try {
    await hireAgy(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    o.git(ada!.cwd, 'add', '-A')
    o.git(ada!.cwd, 'commit', '-qm', 'add toggle')
    const t = Date.now()
    appendFileSync(join(o.home, 'runs.jsonl'), [
      { k: 'begin', t: t - 5000, run: 'r1', agent: ada!.id, name: 'ada', project: o.repo, title: 'Add a dark-mode toggle' },
      { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a toggle.', assumptions: [], outOfScope: [], questions: [] } },
      { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
    ].map((e) => JSON.stringify(e)).join('\n') + '\n')
    await chatTab(o.page)
    const dialog = o.page.getByRole('region', { name: "Finish ada's work" })
    // The agent never reported its work here, so the audit has not started by itself.
    await dialog.getByRole('button', { name: 'Run the audit now' }).click()
    await expect(dialog).toContainText('Audit failed: Quota exhausted', { timeout: 20_000 })
    await expect(dialog.getByRole('button', { name: 'Land on main' })).toBeEnabled()
    expect(existsSync(o.auditLog)).toBe(true)
    expect((JSON.parse(readFileSync(o.auditLog, 'utf8').trim().split('\n')[0]!) as { model: string }).model).toBe('gemini-3.8-flash-high')
  } finally {
    await o.shutdown()
  }
})

test('an agy agent\'s edit is denied by the office while its plan waits, through the plugin\'s own hook route, and agy decides as before for anything else or once the plan is approved', async () => {
  const o = await office('wfagy3', { dial: 'balanced' })
  try {
    await hireAgy(o.page, 'ada')
    const [ada] = await o.page.evaluate(() => window.aw.listAgents())
    await expect.poll(() => (existsSync(o.envFile) ? readFileSync(o.envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
    const env = JSON.parse(readFileSync(o.envFile, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string }
    const pre = (call: object) => fetch(env.url.replace(/\/mcp$/, '/hook/pre-tool'), { method: 'POST', headers: { Authorization: `Bearer ${env.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: 'c1', toolCall: call }) }).then((r) => r.json() as Promise<Record<string, unknown>>)
    const write = { name: 'write_to_file', args: { TargetFile: join(ada!.cwd, 'src', 'a.ts') } }

    // No task yet: nothing is held.
    expect(await pre(write)).toEqual({})
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(env.url), { requestInit: { headers: { Authorization: `Bearer ${env.token}` } } }))
    await client.callTool({ name: 'task_begin', arguments: { title: 'Add a toggle' } })
    expect(await pre(write)).toMatchObject({ decision: 'deny', reason: expect.stringContaining('this office wants your plan approved first') })
    expect(await pre({ name: 'replace_file_content', args: { TargetFile: join(ada!.cwd, 'src', 'a.ts') } })).toMatchObject({ decision: 'deny' })
    expect(await pre({ name: 'write_to_file', args: { TargetFile: join(ada!.cwd, '.agent-world', 'plan.md') } })).toEqual({})
    expect(await pre({ name: 'run_command', args: { CommandLine: 'ls' } })).toEqual({})
    // Handed in: still held, with the words for a plan that waits; approved by the person: not held.
    mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), '## Goal\nAdd a toggle.\n## Assumptions\n- [given] Settings.\n## Out of scope\nnone\n## Open questions\nnone\n')
    await client.callTool({ name: 'plan_submit', arguments: {} })
    expect(await pre(write)).toMatchObject({ decision: 'deny', reason: expect.stringContaining('waiting for the person to approve') })
    await o.page.evaluate(() => window.aw.workflows.summary().then((s) => window.aw.workflows.decide(s.runs[0]!.id, 'approved')))
    expect(await pre(write)).toEqual({})
    await client.close()
  } finally {
    await o.shutdown()
  }
})

test('connected agy with an older plugin says so and updates it on approval, after which the note is gone', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-agyold-'))
  const home = join(tmp, 'home')
  const agyHome = join(home, 'agy')
  const plugins = join(tmp, 'plugins')
  mkdirSync(agyHome, { recursive: true })
  mkdirSync(join(plugins, 'aw-library'), { recursive: true })
  writeFileSync(join(plugins, 'aw-library', 'plugin.json'), JSON.stringify({ name: 'aw-library', version: '0.1.1' }))
  const config = join(tmp, 'mcp_config.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: process.execPath, args: [join(home, 'bin', 'aw-mcp-bridge.cjs')] } } }))
  const folder = join(tmp, 'project')
  mkdirSync(folder)
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: fakeAgy, AW_AGY_HOME: agyHome, AW_AGY_CONFIG: config, AW_AGY_PLUGINS: plugins, FAKE_DELAY_MS: '100' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), folder)
    await page.reload()
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: 'Message box' }).click()
    const box = settings.getByRole('tabpanel')
    const note = box.getByRole('alert').filter({ hasText: 'older than this app' })
    await expect(note).toContainText('cannot hold an edit back while a plan waits for you')
    await note.getByRole('button', { name: 'Update the plugin…' }).click()
    const plan = box.getByRole('group', { name: /Connect agy/ })
    await expect(plan).toContainText('agy plugin install')
    expect(JSON.parse(readFileSync(join(plugins, 'aw-library', 'plugin.json'), 'utf8')).version).toBe('0.1.1')
    await plan.getByRole('button', { name: 'Update' }).click()
    // Between agy's uninstall and its install the file is not there for a moment.
    await expect.poll(() => { try { return JSON.parse(readFileSync(join(plugins, 'aw-library', 'plugin.json'), 'utf8')).version } catch { return 'none' } }, { timeout: 15_000 }).toBe('0.1.3')
    await expect(note).toBeHidden({ timeout: 15_000 })
    expect(Object.keys(JSON.parse(readFileSync(config, 'utf8')).mcpServers)).toEqual(['agent-world'])
  } finally {
    await shutdown()
  }
})

test('with agy as the default program and connected, the builder is an agy agent: read-only, given the builder\'s instructions, and it proposes through the office\'s tools like any other', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'aw-agybuilder-'))
  const home = join(tmp, 'home')
  const plugins = join(tmp, 'plugins')
  mkdirSync(join(home, 'agy'), { recursive: true })
  mkdirSync(join(plugins, 'aw-library'), { recursive: true })
  writeFileSync(join(plugins, 'aw-library', 'plugin.json'), JSON.stringify({ name: 'aw-library', version: '0.1.3' }))
  const config = join(tmp, 'mcp_config.json')
  writeFileSync(config, JSON.stringify({ mcpServers: { 'agent-world': { command: process.execPath, args: [join(home, 'bin', 'aw-mcp-bridge.cjs')] } } }))
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'agy' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true } }))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  const argsFile = join(tmp, 'args.log')
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: fakeAgy, AW_AGY_HOME: join(home, 'agy'), AW_AGY_CONFIG: config, AW_AGY_PLUGINS: plugins, FAKE_ARGS: argsFile, FAKE_ENV_FILE: envFile, FAKE_DELAY_MS: '100' }, tmp)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
    await page.reload()
    await page.locator('header').getByRole('button', { name: /Workflows/ }).click()
    const win = page.getByRole('dialog', { name: 'Workflows' })
    await win.getByRole('tab', { name: 'Workflows' }).click()
    await win.getByRole('button', { name: 'Open the builder' }).click()
    await expect(win.getByText('Nothing proposed yet')).toBeVisible({ timeout: 15_000 })
    const [builder] = await page.evaluate(() => window.aw.listAgents())
    expect(builder).toMatchObject({ name: 'builder', provider: 'agy', builder: true, options: { permissionMode: 'plan', inPlace: true } })
    await expect.poll(() => (existsSync(argsFile) ? readFileSync(argsFile, 'utf8') : ''), { timeout: 20_000 }).toContain('--mode plan')
    expect(readFileSync(argsFile, 'utf8')).toContain('You are the workflow builder')
    await expect.poll(() => (existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
    const env = JSON.parse(readFileSync(envFile, 'utf8').trim().split('\n').at(-1)!) as { url: string; token: string }
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
    const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(env.url), { requestInit: { headers: { Authorization: `Bearer ${env.token}` } } }))
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(expect.arrayContaining(['workflow_list', 'workflow_propose']))
    await client.callTool({ name: 'workflow_propose', arguments: { file: JSON.stringify({ version: 1, id: 'quick', name: 'Quick', steps: [{ id: 'build', kind: 'work' }, { id: 'land', kind: 'merge' }] }) } })
    await expect(win.getByRole('region', { name: 'Workflow proposal' })).toContainText('Quick')
    await client.close()
  } finally {
    await shutdown()
  }
})
