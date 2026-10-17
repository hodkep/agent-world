import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const GAPS = JSON.stringify({ gaps: [{ question: 'Should the toggle follow the operating system setting?', options: ['Follow the system', 'Always manual'] }] })
const PLAN = `## Goal
Add a dark-mode toggle to Settings.

## Assumptions
- [guessed] The choice is saved in preferences.json.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window
`

async function session(o: { dial: string; env: Record<string, string> }) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfintent-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: o.dial, since: 1, planGate: true, mergeGate: true } }))
  const argsLog = join(tmp, 'args.log')
  const auditLog = join(tmp, 'ask.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_AUDIT_LOG: auditLog, ...o.env }, tmp)
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
  const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
  // The person asks for something in the chat; the agent then announces the task and hands in its plan.
  await page.getByRole('tab', { name: 'Chat' }).click()
  const box = page.getByRole('textbox', { name: 'Message ada' })
  await box.fill('add dark mode to the app')
  await box.press('Enter')
  await expect(page.getByRole('log', { name: 'Conversation with ada' })).toContainText('add dark mode to the app')
  // The app reads the request from the conversation file, which the program writes a moment after it is typed.
  await expect.poll(async () => JSON.stringify((await page.evaluate((id) => window.aw.chatGet(id), ada!.id)).items)).toContain('add dark mode to the app')
  await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } })
  mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
  writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), PLAN)
  const stop = () => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'Stop' }) })
  return { page, client, text, shutdown, auditLog, stop }
}

test('at max a small model reads the request against the plan: its questions arrive with the plan marked as the check\'s, approval waits for them, and the answers reach the agent', async () => {
  const s = await session({ dial: 'max', env: { FAKE_AUDIT: GAPS } })
  try {
    expect(s.text(await s.client.callTool({ name: 'plan_submit', arguments: {} }))).toContain('2 open question')
    await s.stop()
    const asked = JSON.parse(readFileSync(s.auditLog, 'utf8').trim().split('\n')[0]!) as string
    expect(asked).toContain('add dark mode to the app')
    expect(asked).toContain('Add a dark-mode toggle to Settings.')

    const panel = s.page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Should the toggle follow the operating system setting?')
    await expect(panel).toContainText('From check')
    await expect(panel).toContainText('The intent check added 1 question · claude-haiku-5-5 · $0.0040')
    const approve = panel.getByRole('button', { name: 'Approve plan' })
    await panel.getByRole('radio', { name: 'Every window' }).click()
    await expect(approve).toBeDisabled()
    await expect(panel).toContainText('1 open question block')
    await panel.getByRole('radio', { name: 'Follow the system' }).click()
    await expect(approve).toBeEnabled()
    await approve.click()
    const log = s.page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Follow the system', { timeout: 15_000 })
    await expect(log).toContainText('Should the toggle follow the operating system setting?')
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('a failed intent check never blocks the plan: it arrives as the agent wrote it, with the reason', async () => {
  const s = await session({ dial: 'max', env: { FAKE_AUDIT_FAIL: 'Credit balance is too low' } })
  try {
    expect(s.text(await s.client.callTool({ name: 'plan_submit', arguments: {} }))).toContain('1 open question')
    await s.stop()
    const panel = s.page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('The intent check failed: Credit balance is too low')
    await expect(panel).not.toContainText('From check')
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('below max no model is asked about the request, and the plan has no check line', async () => {
  const s = await session({ dial: 'balanced', env: { FAKE_AUDIT: GAPS } })
  try {
    await s.client.callTool({ name: 'plan_submit', arguments: {} })
    await s.stop()
    const panel = s.page.getByRole('region', { name: 'Plan from ada' })
    await expect(panel).toContainText('Should the choice apply to every window')
    await expect(panel).not.toContainText('intent check')
    expect(() => readFileSync(s.auditLog, 'utf8')).toThrow()
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})
