import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type Page, expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const PLAN = '## Goal\nAdd a toggle.\n## Assumptions\n- [given] Settings.\n## Out of scope\nnone\n## Open questions\nnone\n'

async function office(name: string) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), `aw-${name}-`)))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  // The repository has a hook of its own, which must keep running.
  mkdirSync(join(repo, '.git', 'hooks'), { recursive: true })
  writeFileSync(join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho ran >> "$(git rev-parse --show-toplevel)/own-hook.log"\n', { mode: 0o755 })
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(join(home, 'agy'), { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const envFile = join(tmp, 'env.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: join(home, 'agy'), FAKE_DELAY_MS: '100', FAKE_ENV_FILE: envFile, FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1', AW_CLAUDE_PROJECTS: join(tmp, 'projects') }, tmp)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  return { repo, git, page, shutdown, envFile }
}

async function hireAgy(page: Page, name: string) {
  await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
  const form = page.getByRole('form', { name: 'Hire an agent' })
  await form.getByRole('radio', { name: /agy/ }).check()
  await form.getByLabel('Name').fill(name)
  await form.getByRole('button', { name: 'Hire' }).click()
  await form.waitFor({ state: 'detached' })
}

/** git as the agent's own processes run it: the environment the app started the agent with. */
const asAgent = (env: { url: string; token: string; git: Record<string, string> }) => (cwd: string, ...args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((done) =>
    execFile('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, env: { ...process.env, ...env.git, AW_MCP_URL: env.url, AW_AGENT_TOKEN: env.token } }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` }))
  )

for (const program of ['claude', 'agy'] as const) {
  test(`a commit by a ${program} agent is held until its plan is approved, whatever the program: git itself asks the office, the repository's own hook still runs, and the plan's own file may be committed`, async () => {
    const o = await office(`wfgate-${program}`)
    try {
      if (program === 'claude') await hire(o.page, { name: 'ada' })
      else await hireAgy(o.page, 'ada')
      const [ada] = await o.page.evaluate(() => window.aw.listAgents())
      await expect.poll(() => (existsSync(o.envFile) ? readFileSync(o.envFile, 'utf8') : ''), { timeout: 20_000 }).toMatch(/"token":"[0-9a-f]{48}"/)
      const env = JSON.parse(readFileSync(o.envFile, 'utf8').trim().split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string; git: Record<string, string> }
      expect(env.git).toMatchObject({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath' })
      const git = asAgent(env)

      // The agent begins a task through its own tools: a plan is asked for, so edits and commits wait.
      const client = new Client({ name: 'test', version: '1' })
      await client.connect(new StreamableHTTPClientTransport(new URL(env.url), { requestInit: { headers: { Authorization: `Bearer ${env.token}` } } }))
      await client.callTool({ name: 'task_begin', arguments: { title: 'Add a toggle' } })
      writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
      await git(ada!.cwd, 'add', '-A')
      const held = await git(ada!.cwd, 'commit', '-qm', 'add toggle')
      expect(held.ok).toBe(false)
      expect(held.out).toContain('Agent World: this commit is held. Not yet: this office wants your plan approved first.')
      expect(o.git(ada!.cwd, 'log', '--format=%s', '-1')).toBe('init')
      // Skipping git's hooks does not get round it: git also asks before it moves the agent's branch.
      const skipped = await git(ada!.cwd, 'commit', '--no-verify', '-qm', 'add toggle')
      expect(skipped.ok).toBe(false)
      expect(skipped.out).toContain('Agent World: this change to a branch is held.')
      expect(o.git(ada!.cwd, 'log', '--format=%s', '-1')).toBe('init')
      // Other branches and tags are the agent's to make.
      expect((await git(ada!.cwd, 'branch', 'scratch')).ok).toBe(true)

      // The plan's own file alone is let through; the repository's own hook ran for it.
      await git(ada!.cwd, 'reset', '-q')
      mkdirSync(join(ada!.cwd, '.agent-world'), { recursive: true })
      writeFileSync(join(ada!.cwd, '.agent-world', 'plan.md'), PLAN)
      await git(ada!.cwd, 'add', '-f', '.agent-world/plan.md')
      expect((await git(ada!.cwd, 'commit', '-qm', 'the plan')).ok).toBe(true)
      expect(readFileSync(join(ada!.cwd, 'own-hook.log'), 'utf8')).toContain('ran')

      // Handed in, then approved by the person: the commit goes through.
      await client.callTool({ name: 'plan_submit', arguments: {} })
      await git(ada!.cwd, 'add', '-A')
      expect((await git(ada!.cwd, 'commit', '-qm', 'add toggle')).out).toContain('waiting for the person to approve')
      const run = await o.page.evaluate(() => window.aw.workflows.summary().then((s) => s.runs[0]!.id))
      await o.page.evaluate((id) => window.aw.workflows.decide(id, 'approved'), run)
      expect((await git(ada!.cwd, 'commit', '-qm', 'add toggle')).ok).toBe(true)
      expect(o.git(ada!.cwd, 'log', '--format=%s', '-1')).toBe('add toggle')
      await client.close()
    } finally {
      await o.shutdown()
    }
  })
}
