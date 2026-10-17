import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type Locator, type Page, _electron as electron } from '@playwright/test'

/** Where the README's pictures go. */
export const SHOTS_DIR = resolve(__dirname, '..', 'docs', 'images')
export const SHOTS_ON = !!process.env.AW_SHOTS

export type Scene = 'story' | 'idle' | 'waiting' | 'thinking' | 'researching' | 'implementing' | 'running' | 'delegating' | 'permission' | 'asleep'

/** A small project to work in: a git repository with a few files, committed, as a person's own would be. */
export function makeProject(tmp: string, name = 'storefront') {
  const repo = join(realpathSync(tmp), name)
  mkdirSync(join(repo, 'src'), { recursive: true })
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...a], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), `# ${name}\n\nA small online shop.\n`)
  writeFileSync(join(repo, 'src', 'app.ts'), "export const app = { name: 'storefront' }\n")
  writeFileSync(join(repo, 'src', 'health.ts'), 'export const ok = false\n')
  writeFileSync(join(repo, 'src', 'cart.ts'), 'export const cartTotal = (items: number[]) => items.reduce((a, b) => a + b, 0)\n')
  git('add', '.')
  git('commit', '-qm', 'chore: first commit')
  return { repo, git }
}

/**
 * The app as a person has it on a fresh machine with Claude Code signed in, driven by the scripted fake agents (no tokens, no sign-in): a temp home, a project
 * folder, workflows on, and the window at a size that reads well in a README. `scenes` says what each named agent is doing; `video` records the window.
 */
export async function shotApp(o: { env?: Record<string, string>; prefs?: object; scenes?: Record<string, Scene>; video?: string; size?: { width: number; height: number }; /** The first run: no preferences yet, so setup shows. */ fresh?: boolean; /** Antigravity (the fake agy) is on the computer too. */ agy?: boolean } = {}) {
  const launchedAt = Date.now()
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-shots-')))
  const { repo, git } = makeProject(tmp)
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  if (!o.fresh) writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true }, ...o.prefs }))
  // The programs the app finds are shims at plain paths, so no path of this computer's own is drawn in a picture (setup says where each program is).
  const bin = join(tmp, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const [name, script] of [['claude', 'shots-claude.mjs'], ['agy', 'fake-agy.mjs']] as const) {
    writeFileSync(join(bin, name), `#!/bin/sh\nexec node "${resolve(__dirname, script)}" "$@"\n`)
    chmodSync(join(bin, name), 0o755)
  }
  const { CLAUDE_CONFIG_DIR: _own, ...inherited } = process.env
  const size = o.size ?? { width: 1400, height: 900 }
  const app = await electron.launch({
    args: [resolve(__dirname, '..')],
    env: {
      ...(inherited as Record<string, string>),
      AW_HIDDEN: '1', AW_ZOOM: '1', AW_NO_SETUP: o.fresh ? '' : '1', AW_HOME: home, AW_USER_HOME: join(tmp, 'user'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'),
      AW_CLAUDE_BIN: join(bin, 'claude'), AW_AGY_BIN: o.agy ? join(bin, 'agy') : '/no/such/agy', AW_GEMINI_BIN: '/no/such/gemini', AW_AGY_PLUGINS: join(tmp, 'agy-plugins'), ...(o.agy && { AW_AGY_HOME: join(tmp, 'agy'), AW_AGY_CONFIG: join(tmp, 'mcp_config.json') }),
      FAKE_DELAY_MS: '150', FAKE_TRANSCRIPT: '1', FAKE_ARGS: join(tmp, 'args.log'), FAKE_ENV_FILE: join(tmp, 'env.log'), SHOTS_SCENES: JSON.stringify(o.scenes ?? {}), ...o.env
    },
    ...(o.video && { recordVideo: { dir: o.video, size } })
  })
  await app.context().addInitScript(() => localStorage.getItem('aw.compact') === null && localStorage.setItem('aw.compact', '0'))
  const proc = app.process()
  const page = await app.firstWindow()
  await page.setViewportSize(size)
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  const shutdown = async () => {
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
  }
  return { app, page, repo, git, home, tmp, argsLog: join(tmp, 'args.log'), envLog: join(tmp, 'env.log'), launchedAt, shutdown }
}

/** Hire an agent by name from the form and stay on the page the app opens. */
export async function hireNamed(page: Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

/** A picture of the whole window, or of `clip`, saved under docs/images. */
export async function shoot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`), ...(clip && { clip }) })
}

/** A skill as Claude keeps it in `~/.claude/skills`, for the library to import. */
export function writeSkill(userHome: string, name: string, description: string, body: string) {
  const dir = join(userHome, '.claude', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`)
}

/** The office's own tools, as an agent calls them (the todo board, the library, a workflow run), through the address and token the app gave the first agent it started. */
export async function officeTools(argsLog: string) {
  const line = readFileSync(argsLog, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--mcp-config'))!
  const mcp = JSON.parse(readFileSync(line[line.indexOf('--mcp-config') + 1]!, 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
  const client = new Client({ name: 'shots', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit: { headers: mcp.headers } }))
  return {
    call: async (name: string, args: Record<string, unknown> = {}) => ((await client.callTool({ name, arguments: args })) as { content: { text: string }[] }).content[0]!.text,
    close: () => client.close()
  }
}

export const exists = existsSync

/** The task of `agentId` that follows the Journey workflow, with its plan approved, as the log would hold it. */
export function seedRun(home: string, o: { agentId: string; repo: string }) {
  const JOURNEY = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'land', kind: 'merge', name: 'Land', gate: 'approve' }] }
  const t = Date.now()
  const events = [
    { k: 'begin', t: t - 5000, run: 'r1', agent: o.agentId, name: 'ada', project: o.repo, title: 'Add a dark-mode toggle', workflow: JOURNEY },
    { k: 'plan', t: t - 4000, run: 'r1', round: 1, state: 'submitted', path: '.agent-world/plan.md', readback: { goal: 'Add a dark-mode toggle to Settings.', assumptions: [], outOfScope: ['A theme per project.'], questions: [] } },
    { k: 'plan', t: t - 3000, run: 'r1', round: 1, state: 'approved' }
  ]
  appendFileSync(join(home, 'runs.jsonl'), `${events.map((e) => JSON.stringify(e)).join('\n')}\n`)
}

/** git as the agent's own processes run it: the environment the app started the agent with, so the office's hooks apply. */
export function agentGit(envLog: string) {
  const env = JSON.parse(readFileSync(envLog, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string; git: Record<string, string> }
  return (cwd: string, ...args: string[]) =>
    new Promise<{ ok: boolean; out: string }>((done) =>
      execFile('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
    )
}

/** A picture of one element (a window the app opened), saved under docs/images. */
export async function shootElement(el: Locator, name: string) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  await el.screenshot({ path: join(SHOTS_DIR, `${name}.png`) })
}
