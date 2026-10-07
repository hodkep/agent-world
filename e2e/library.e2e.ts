import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
// The fake Claude logs each start as a JSON list; the fake agy logs plain words, and both also log the probes the app makes.
const claudeStart = (f: string): string[] => read(f).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).filter((a) => a.includes('--session-id') || a.includes('--resume')).at(-1) ?? []
const agyStart = (f: string): string => read(f).split('\n').filter((l) => l.includes('Talk short and plain.')).at(-1) ?? ''
const skill = (dir: string, name: string, desc: string, body: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}`)
}

test('the library: skills imported once, a playbook chooses them, and Claude and agy are each given them the way they can take them', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-lib-e2e-'))
  const user = join(home, 'user')
  skill(join(user, '.claude', 'skills', 'caveman'), 'caveman', 'Talk tersely.', 'Drop articles. Fragments are fine.')
  skill(join(user, '.claude', 'skills', 'pdf'), 'pdf', 'Work with PDFs.', 'Use the helper script when asked to split a PDF.')
  mkdirSync(join(user, '.claude', 'skills', 'pdf', 'scripts'), { recursive: true })
  writeFileSync(join(user, '.claude', 'skills', 'pdf', 'scripts', 'split.sh'), 'echo split')
  const project = join(home, 'project')
  mkdirSync(project)
  const args = join(home, 'args.log')
  const envLog = join(home, 'env.log')
  const agyHome = join(home, 'agy')
  const { app, shutdown } = await launchApp(
    { AW_HOME: join(home, 'aw'), AW_USER_HOME: user, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: agyHome, FAKE_ENV_FILE: envLog, FAKE_ARGS: args, FAKE_DELAY_MS: '300' },
    home
  )
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: 1400, height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), project)
    await page.reload()

    // Settings, Library: import the two skills found on this computer, and write one instruction.
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('tab', { name: 'Library' }).click()
    const pane = dialog.getByRole('tabpanel')
    await pane.getByRole('button', { name: 'Import from this computer…' }).click()
    const importing = pane.getByRole('group', { name: 'Import from this computer' })
    await expect(importing).toContainText('caveman')
    await expect(importing).toContainText('~/.claude/skills')
    await importing.getByRole('button', { name: 'Import 2 selected' }).click()
    await expect(pane.getByRole('status')).toContainText('Imported 2')
    await expect(pane.getByRole('button', { name: 'Open caveman' })).toBeVisible()
    await pane.getByRole('button', { name: 'New instruction' }).click()
    await pane.getByLabel('Item name').fill('Terse')
    await pane.getByLabel('Item description').fill('Talk short.')
    await pane.getByLabel('Item text').fill('Talk short and plain.')
    await pane.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(pane.getByRole('button', { name: 'Open Terse' })).toBeVisible()
    // A skill opens to its text, and says it was copied in.
    await pane.getByRole('button', { name: 'Open pdf' }).click()
    await expect(pane.getByRole('group', { name: 'pdf in detail' })).toContainText('Use the helper script')
    await expect(pane.getByRole('group', { name: 'pdf in detail' })).toContainText('scripts/split.sh')

    // The workspace playbook: Terse always (reminded each turn), PDFs on demand.
    await pane.getByRole('group', { name: 'Playbook scope' }).getByRole('button').nth(1).click()
    await pane.getByLabel('Item to add').selectOption({ label: 'Terse (instruction)' })
    await pane.getByRole('button', { name: 'Add to playbook' }).click()
    await pane.getByLabel('Mode for terse').selectOption('always')
    await pane.getByLabel('Strength for terse').selectOption('medium')
    await pane.getByLabel('Item to add').selectOption({ label: 'pdf (skill)' })
    await pane.getByRole('button', { name: 'Add to playbook' }).click()
    await pane.getByLabel('When to use pdf').fill('working with PDFs')
    // What an agent sees, for each program: Claude is told how to fetch; agy is not connected to the message box yet, so it only gets what can be put in the text.
    const sees = pane.getByRole('group', { name: 'What an agent is told' })
    await expect(sees.getByLabel('Opening text')).toContainText('Talk short and plain.')
    await expect(sees.getByLabel('Opening text')).toContainText('working with PDFs: pdf')
    await expect(sees).toContainText('Reminder: terse (always).')
    await sees.getByLabel('Program').selectOption({ label: 'agy (Antigravity)' })
    await expect(sees.getByLabel('Opening text')).toContainText('Talk short and plain.')
    await expect(sees.getByLabel('Opening text')).not.toContainText('library_index')
    await sees.getByLabel('Program').selectOption({ label: 'Claude Code' })
    // It is saved as it is edited.
    await expect.poll(() => readdirJson(join(home, 'aw', 'library', 'playbooks', 'workspaces'))).toHaveLength(1)
    await dialog.getByRole('button', { name: 'Close settings' }).click()

    // A Claude agent starts with the opening text, a session-only plugin folder of just the allowed skill, and the library folder readable.
    await hire(page)
    await expect.poll(() => claudeStart(args).length).toBeGreaterThan(0)
    const claude = claudeStart(args)
    const told = claude[claude.indexOf('--append-system-prompt') + 1]!
    expect(told).toContain('Talk short and plain.')
    expect(told).toContain('working with PDFs: pdf')
    // ...and where to read the catalog again if it loses track of what the library holds.
    expect(told).toContain(join(home, 'aw', 'library', 'catalog'))
    const [catalogFile] = require('node:fs').readdirSync(join(home, 'aw', 'library', 'catalog')) as string[]
    expect(readFileSync(join(home, 'aw', 'library', 'catalog', catalogFile!), 'utf8')).toContain('- pdf: working with PDFs')
    const plugin = claude[claude.indexOf('--plugin-dir') + 1]!
    expect(plugin).toMatch(/library[\\/]run[\\/][\w-]+$/)
    expect(JSON.parse(readFileSync(join(plugin, '.claude-plugin', 'plugin.json'), 'utf8')).name).toBe('agent-world-library')
    expect(existsSync(join(plugin, 'skills', 'pdf', 'scripts', 'split.sh'))).toBe(true)
    expect(existsSync(join(plugin, 'skills', 'caveman'))).toBe(false)
    expect(claude).toContain(join(home, 'aw', 'library'))

    // Through the office's tools it can list and read only what the playbook allows, and every read is recorded.
    const mcp = JSON.parse(readFileSync(claude[claude.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: { Authorization: string } }
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
    const say = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
    const index = say(await client.callTool({ name: 'library_index', arguments: {} }))
    expect(index).toContain('- terse')
    expect(index).toContain('- pdf')
    expect(index).not.toContain('caveman')
    const got = say(await client.callTool({ name: 'library_get', arguments: { id: 'pdf' } }))
    expect(got).toContain('Use the helper script')
    expect(got).toContain(join(home, 'aw', 'library', 'skills', 'pdf', 'scripts', 'split.sh'))
    const refused = await client.callTool({ name: 'library_get', arguments: { id: 'caveman' } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    await client.close()
    const usage = await page.evaluate(() => window.aw.library.list().then((l) => l.usage))
    expect(usage.pdf).toMatchObject({ total: 1 })
    expect(usage.caveman).toBeUndefined()

    // Each message it is sent is answered through its hook with a line for the library items the message points at, and none for one that points at nothing.
    const hook = JSON.parse(readFileSync(claude[claude.indexOf('--settings') + 1]!, 'utf8')).hooks.UserPromptSubmit[0].hooks[0] as { url: string; headers: Record<string, string> }
    const prompt = async (text: string) =>
      (await (await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: text }) })).text()) || ''
    const nudged = JSON.parse(await prompt('please split this pdf into pages')).hookSpecificOutput.additionalContext as string
    expect(nudged).toContain("Library: this task matches pdf")
    expect(nudged).toContain("library_get('pdf')")
    expect(nudged).toContain('Reminder: terse (always).')
    expect(JSON.parse(await prompt('rename the lamp post')).hookSpecificOutput.additionalContext).not.toContain('pdf')
    // Its own Skill tool is counted too (and only for items of the library), and the stats say triggered, answered and used.
    const tool = (name: string, input: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: name, tool_input: input }) })
    await tool('Skill', { skill: 'agent-world-library:pdf' })
    await tool('Skill', { skill: 'something-else' })
    const uses = read(join(home, 'aw', 'library', 'uses.jsonl')).trim().split('\n').map((l) => JSON.parse(l) as { id: string; how: string })
    expect(uses.filter((u) => u.id === 'pdf' && u.how === 'triggered')).toHaveLength(1)
    expect(uses.filter((u) => u.id === 'pdf' && u.how === 'skill')).toHaveLength(1)
    expect(uses.some((u) => u.id === 'something-else')).toBe(false)
    expect(uses.some((u) => u.id === 'terse' && u.how === 'delivered')).toBe(true)

    // An agy agent gets the text too, but no plugin folder: it has no such flag.
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByRole('radio', { name: /agy/ }).check()
    await form.getByLabel('Name').fill('bob')
    // Hiring says what the project's playbook gives the agent.
    await expect(form.getByRole('note', { name: 'The library for this agent' })).toContainText('1 told every time, 1 pointed at')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    await expect.poll(() => agyStart(args)).not.toBe('')
    expect(agyStart(args)).not.toContain('--plugin-dir')

    // agy's plugin calls the office's hook route with the token in its environment: it answers with a line to inject (the path of the skill, which agy can read without asking), once per message, and counts a read of the skill's file.
    await expect.poll(() => read(envLog).trim().split('\n').filter((l) => l.includes('"token":"')).length).toBeGreaterThan(0)
    const started = JSON.parse(read(envLog).trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string }
    const transcript = join(agyHome, 'brain', 'conv-1', '.system_generated', 'logs', 'transcript_full.jsonl')
    mkdirSync(join(transcript, '..'), { recursive: true })
    writeFileSync(transcript, JSON.stringify({ step_index: '0', type: 'USER_INPUT', content: '<USER_REQUEST>\nsplit this pdf\n</USER_REQUEST>' }) + '\n')
    const call = async (event: string, body: object) =>
      (await fetch(started.url.replace(/\/mcp$/, `/hook/${event}`), { method: 'POST', headers: { authorization: `Bearer ${started.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<Record<string, unknown>>
    const skillFile = join(home, 'aw', 'library', 'skills', 'pdf', 'SKILL.md')
    const injected = (await call('pre-inv', { conversationId: 'conv-1', transcriptPath: transcript })) as { injectSteps: { ephemeralMessage: string }[] }
    expect(injected.injectSteps[0]!.ephemeralMessage).toContain(`Read ${skillFile}`)
    expect(await call('pre-inv', { conversationId: 'conv-1', transcriptPath: transcript })).toEqual({})
    expect(await call('post-tool', { conversationId: 'conv-1', toolCall: { name: 'view_file', args: { AbsolutePath: skillFile } } })).toEqual({})
    const after = await page.evaluate(() => window.aw.library.list().then((l) => l.usage))
    expect(after.pdf).toMatchObject({ agy: 1 })
    // A caller without a token of its own is refused.
    expect((await fetch(started.url.replace(/\/mcp$/, '/hook/pre-inv'), { method: 'POST', body: '{}' })).status).toBe(401)
  } finally {
    await shutdown()
  }
})

function readdirJson(dir: string): string[] {
  try {
    return require('node:fs').readdirSync(dir).filter((f: string) => f.endsWith('.json'))
  } catch {
    return []
  }
}
