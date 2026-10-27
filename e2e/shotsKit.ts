import { execFile, execFileSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { weekStartOf } from '../src/shared/ledger'
import { type CDPSession, type Locator, type Page, _electron as electron } from '@playwright/test'

/** Where the README's pictures go. */
export const SHOTS_DIR = resolve(__dirname, '..', 'docs', 'images')
export const SHOTS_ON = !!process.env.AW_SHOTS

/** Pixels in a picture for each pixel of the window: a picture stays sharp on a dense screen, and when GitHub scales it down. */
const DENSITY = 2
const sessions = new WeakMap<Page, CDPSession>()

export type Scene = 'story' | 'idle' | 'waiting' | 'thinking' | 'researching' | 'implementing' | 'running' | 'delegating' | 'permission' | 'asleep'

/** The environment of whoever runs the shots without what is theirs alone: another office's addresses and tokens, git's hooks set for an agent, a Claude login folder, fake-agent switches. */
export const cleanEnv = (): Record<string, string> =>
  Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !/^(AW_|GIT_CONFIG_|FAKE_|SHOTS_)/.test(k) && k !== 'CLAUDE_CONFIG_DIR')) as Record<string, string>

/** A small project to work in: a git repository with a few files, committed, as a person's own would be. */
export function makeProject(tmp: string, name = 'storefront') {
  const repo = join(realpathSync(tmp), name)
  mkdirSync(join(repo, 'src'), { recursive: true })
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...a], { cwd: repo, encoding: 'utf8', env: cleanEnv() }).trim()
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
export async function shotApp(o: { env?: Record<string, string>; prefs?: object; scenes?: Record<string, Scene>; video?: string; size?: { width: number; height: number }; /** The first run: no preferences yet, so setup shows. */ fresh?: boolean; /** Antigravity (the fake agy) is on the computer too. */ agy?: boolean; /** Fills the office's home (a ledger, say) before the app starts, which is when it reads what is there. */ seed?: (home: string) => void } = {}) {
  const launchedAt = Date.now()
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-shots-')))
  const { repo, git } = makeProject(tmp)
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  if (!o.fresh) writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true }, ...o.prefs }))
  o.seed?.(home)
  // The programs the app finds are shims at plain paths, so no path of this computer's own is drawn in a picture (setup says where each program is).
  const bin = join(tmp, 'bin')
  mkdirSync(bin, { recursive: true })
  for (const [name, script] of [['claude', 'shots-claude.mjs'], ['agy', 'fake-agy.mjs']] as const) {
    writeFileSync(join(bin, name), `#!/bin/sh\nexec node "${resolve(__dirname, script)}" "$@"\n`)
    chmodSync(join(bin, name), 0o755)
  }
  const size = o.size ?? { width: 1400, height: 900 }
  const app = await electron.launch({
    args: [resolve(__dirname, '..')],
    env: {
      ...cleanEnv(),
      AW_HIDDEN: '1', AW_ZOOM: '1', AW_NO_SETUP: o.fresh ? '' : '1', AW_HOME: home, AW_USER_HOME: join(tmp, 'user'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'),
      AW_CLAUDE_BIN: join(bin, 'claude'), AW_AGY_BIN: o.agy ? join(bin, 'agy') : '/no/such/agy', AW_GEMINI_BIN: '/no/such/gemini', AW_AGY_PLUGINS: join(tmp, 'agy-plugins'), ...(o.agy && { AW_AGY_HOME: join(tmp, 'agy'), AW_AGY_CONFIG: join(tmp, 'mcp_config.json') }),
      FAKE_DELAY_MS: '150', FAKE_TRANSCRIPT: '1', FAKE_ARGS: join(tmp, 'args.log'), FAKE_ENV_FILE: join(tmp, 'env.log'), SHOTS_SCENES: JSON.stringify(o.scenes ?? {}), ...o.env
    },
    ...(o.video && { recordVideo: { dir: o.video, size: { width: size.width * DENSITY, height: size.height * DENSITY } } })
  })
  // The office follows the real hour and a made-up weather: a picture taken at dusk comes out orange, and one in the rain streaked. The pictures are all of one clear midday, the office in daylight.
  await app.context().addInitScript(() => {
    localStorage.setItem('aw.clockHour', '12')
    localStorage.setItem('aw.weather', 'clear')
  })
  const proc = app.process()
  const page = await app.firstWindow()
  await page.setViewportSize(size)
  // Twice the pixels of the window, so a picture stays sharp on a high-density screen and when GitHub scales it down.
  await (await app.context().newCDPSession(page)).send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: false })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  const shutdown = async () => {
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
    if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
  }
  return { app, page, repo, git, home, tmp, argsLog: join(tmp, 'args.log'), envLog: join(tmp, 'env.log'), launchedAt, shutdown }
}

/**
 * Sizes the window and makes the page draw at twice the density. Playwright's own screenshot of an Electron window comes out at one pixel per pixel
 * whatever the page's density, so the pictures are taken through `capture` below, which asks the browser itself.
 */
export async function setWindow(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size)
  await (await session(page)).send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: DENSITY, mobile: false })
}

async function session(page: Page) {
  let cdp = sessions.get(page)
  if (!cdp) sessions.set(page, (cdp = await page.context().newCDPSession(page)))
  return cdp
}

/** The page, or `clip` of it (in the window's own pixels), as a PNG at `DENSITY` times its size. */
async function capture(page: Page, path: string, clip?: { x: number; y: number; width: number; height: number }) {
  const cdp = await session(page)
  const x = clip && Math.floor(clip.x)
  const y = clip && Math.floor(clip.y)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip && { clip: { x: x!, y: y!, width: Math.ceil(clip.x + clip.width) - x!, height: Math.ceil(clip.y + clip.height) - y!, scale: 1 } }) })
  writeFileSync(path, Buffer.from(data, 'base64'))
}

/** Hire an agent by name from the form and stay on the page the app opens. */
export async function hireNamed(page: Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

/** A picture of the whole window, or of `clip`, saved under docs/images (a `name` with a folder in it, such as `releases/0.6.0/notes`, goes in that folder). */
export async function shoot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
  const path = join(SHOTS_DIR, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  await capture(page, path, clip)
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
  const JOURNEY = { id: 'journey', name: 'Journey', steps: [{ id: 'plan', kind: 'plan', name: 'Plan', gate: 'approve' }, { id: 'build', kind: 'work', name: 'Build' }, { id: 'review', kind: 'audit', name: 'Review' }, { id: 'pr', kind: 'pr', name: 'Pull request', gate: 'approve' }] }
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
      execFile('git', ['-c', 'user.email=dev@example.com', '-c', 'user.name=Dev', ...args], { cwd, env: { ...cleanEnv(), ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
    )
}

/** A picture of one element (a window the app opened), saved under docs/images. */
export async function shootElement(el: Locator, name: string) {
  const path = join(SHOTS_DIR, `${name}.png`)
  mkdirSync(dirname(path), { recursive: true })
  const box = await el.boundingBox()
  if (!box) throw new Error(`${name}: nothing to take a picture of`)
  await capture(el.page(), path, box)
}

/** The week as the Usage window and the Weekly Rewind draw it: exact requests from Claude and agy, an account, and last week counted exactly too. */
export function seedTokens(home: string) {
  const now = Date.now()
  const monday = weekStartOf(now)
  const thisWeek = (n: number) => Math.min(now, monday + n * 3_600_000)
  const lastWeek = (n: number) => monday - 6 * 86_400_000 + n * 3_600_000
  const req = (t: number, o: object) => ({ k: 'req', t, project: 'storefront', model: 'claude-sonnet-5-5', provider: 'claude', ...o })
  const cost = (t: number, o: object) => ({ k: 'cost', t, project: 'storefront', model: 'claude-sonnet-5-5', provider: 'claude', ...o })
  const ev = [
    cost(thisWeek(1), { agent: 'a', name: 'ada', usd: 6.4, account: 'work' }),
    cost(thisWeek(30), { agent: 'b', name: 'bo', usd: 2.1 }),
    cost(lastWeek(2), { agent: 'a', name: 'ada', usd: 4.3, account: 'work' }),
    cost(lastWeek(6), { agent: 'b', name: 'bo', usd: 1.9 }),
    { k: 'work', t: thisWeek(2), agent: 'a', project: 'storefront', ms: 5_400_000, provider: 'claude', name: 'ada', account: 'work' },
    { k: 'work', t: lastWeek(3), agent: 'a', project: 'storefront', ms: 3_600_000, provider: 'claude', name: 'ada', account: 'work' },
    req(thisWeek(1), { agent: 'a', name: 'ada', account: 'work', input: 1800, cacheRead: 412_000, cacheWrite: 21_000, output: 9400 }),
    req(thisWeek(3), { agent: 'a', name: 'ada', account: 'work', input: 2200, cacheRead: 530_000, cacheWrite: 14_000, output: 12_100 }),
    req(thisWeek(30), { agent: 'b', name: 'bo', input: 900, cacheRead: 160_000, cacheWrite: 8000, output: 4100 }),
    req(thisWeek(33), { agent: 'c', name: 'cy', project: 'warehouse', provider: 'agy', model: 'Gemini 3.8 Flash', input: 24_000, cacheRead: 61_000, output: 6200 }),
    req(lastWeek(2), { agent: 'a', name: 'ada', account: 'work', input: 1500, cacheRead: 320_000, cacheWrite: 19_000, output: 8000 }),
    req(lastWeek(6), { agent: 'b', name: 'bo', input: 800, cacheRead: 120_000, cacheWrite: 6000, output: 3300 }),
    req(lastWeek(7), { agent: 'c', name: 'cy', project: 'warehouse', provider: 'agy', model: 'Gemini 3.8 Flash', input: 20_000, cacheRead: 40_000, output: 5000 })
  ]
  writeFileSync(join(home, 'ledger.jsonl'), ev.map((e) => JSON.stringify(e)).join('\n') + '\n')
}
