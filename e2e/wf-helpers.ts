import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Locator, Page } from '@playwright/test'
import { launchApp } from './launch'

/** Shared by the workflow walkthrough specs: a project with a git repository, an app home, and the pieces each scenario needs. */
export const fakeClaude = resolve(__dirname, 'fake-claude.mjs')
export const fakeAgy = resolve(__dirname, 'fake-agy.mjs')

export const PLAN = '## Goal\nAdd a toggle.\n## Assumptions\n- [given] Settings.\n## Out of scope\nnone\n## Open questions\nnone\n'

export const gitIn = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()

export function makeRepo(parent: string, name = 'shop') {
  const repo = join(parent, name)
  mkdirSync(repo, { recursive: true })
  gitIn(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), `# ${name}\n`)
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'init')
  return repo
}

export interface World {
  tmp: string
  home: string
  repo: string
  env: Record<string, string>
}

/** The folders and environment of one office; `prefs` is merged into the workflow preferences. */
export function world(name: string, o: { prefs?: object; env?: Record<string, string>; dial?: string } = {}): World {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'agy'), { recursive: true })
  const repo = makeRepo(tmp)
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: o.dial ?? 'balanced', since: 1, planGate: true, mergeGate: true, ...o.prefs } }))
  const env: Record<string, string> = { AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: fakeClaude, AW_AGY_BIN: fakeAgy, AW_AGY_HOME: join(home, 'agy'), AW_AGY_CONFIG: join(tmp, 'mcp_config.json'), AW_AGY_PLUGINS: join(tmp, 'plugins'), FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', FAKE_ENV_FILE: join(tmp, 'env.log'), FAKE_ARGS: join(tmp, 'args.log'), FAKE_AUDIT_LOG: join(tmp, 'audit.log'), ...o.env }
  return { tmp, home, repo, env }
}

/** Starts the app on a world. `folder` is the project the window shows. Shutting down leaves the folders (call `world.tmp` removal yourself) unless `keep` is false. */
export async function start(w: World, o: { folder?: string; width?: number; height?: number; keep?: boolean } = {}) {
  const { app, shutdown } = await launchApp(w.env, o.keep === false ? w.tmp : join(w.tmp, 'unused'))
  const page = await app.firstWindow()
  await page.setViewportSize({ width: o.width ?? 1400, height: o.height ?? 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), o.folder ?? w.repo)
  await page.reload()
  return { app, page, shutdown }
}

export async function hireAgy(page: Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

/** What the fake program logged when it started: the office's address and token, and git's configuration. One line per start. */
export const envLines = (w: World) => (existsSync(w.env.FAKE_ENV_FILE!) ? readFileSync(w.env.FAKE_ENV_FILE!, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).map((l) => JSON.parse(l) as { url: string; token: string; git: Record<string, string> }) : [])

export async function mcpAs(env: { url: string; token: string }) {
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(env.url), { requestInit: { headers: { Authorization: `Bearer ${env.token}` } } }))
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
    return { text: r.content[0]!.text, error: r.isError === true }
  }
  return { client, call }
}

export async function openWorkflows(page: Page, tab: 'Runs' | 'Workflows' = 'Workflows') {
  await page.locator('header').getByRole('button', { name: /Workflows/ }).click()
  const win = page.getByRole('dialog', { name: 'Workflows' })
  await win.getByRole('tab', { name: tab }).click()
  return win
}

/** A screenshot into the walkthrough's folder, only when WALK_SHOTS names one. */
export async function shot(target: Page | Locator, name: string) {
  const dir = process.env.WALK_SHOTS
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await target.screenshot({ path: join(dir, `${name}.png`) })
}

export const BILLING = {
  version: 1,
  id: 'billing-change',
  name: 'Billing change',
  when: 'A change touching src/billing/.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'approve' },
    { id: 'build', kind: 'work', name: 'Build' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run: 'npm test', gate: 'pass' },
    { id: 'land', kind: 'merge' }
  ]
}

/** git as the agent's own processes run it: with the environment the app started the agent with, so the office's hooks apply. */
export const gitAs = (env: { url: string; token: string; git: Record<string, string> }) => (cwd: string, ...args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((done) =>
    execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
  )

/** The events the office has logged, oldest first. */
export const runEvents = (w: World) => (existsSync(join(w.home, 'runs.jsonl')) ? readFileSync(join(w.home, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as { k: string; state?: string; step?: string; run?: string; how?: string; ok?: boolean; attempt?: number }] } catch { return [] } }) : [])
