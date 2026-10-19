import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const REVIEWED = {
  version: 1,
  id: 'reviewed',
  name: 'Reviewed',
  when: 'Changes that need a second look.',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'auto' },
    { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change.' },
    { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff. See https://example.com/spec.' },
    { id: 'review', kind: 'audit' },
    { id: 'land', kind: 'merge' }
  ]
}
const QUICK = { version: 1, id: 'quick', name: 'Quick', when: 'Typos.', steps: [{ id: 'build', kind: 'work', name: 'Build' }, { id: 'land', kind: 'merge', gate: 'auto' }] }

test('an agent follows its project\'s workflow: the brief comes back from task_begin, edits are not held when the plan step says auto, a step it reports waits for the person, landing is refused until they approve, and the strip shows where it stands', async () => {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfsteps-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
  writeFileSync(join(repo, '.agent-world', 'workflows', 'reviewed.json'), JSON.stringify(REVIEWED))
  writeFileSync(join(repo, '.agent-world', 'workflows', 'quick.json'), JSON.stringify(QUICK))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'workflows')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, planGate: true, mergeGate: true, defaults: { [repo]: 'reviewed' } } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
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
    // The opening text lists the project's other workflow, since there is a choice.
    expect(flag('--append-system-prompt')).toContain('Reviewed is the default')
    expect(flag('--append-system-prompt')).toContain('- quick: Typos.')
    const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
    const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
    const post = (body: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, ...body }) })
    const edit = () => post({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(ada!.cwd, 'src/a.ts'), old_string: 'a', new_string: 'b' } }).then((r) => r.text())
    const client = new Client({ name: 'test', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
      return { text: r.content[0]!.text, error: r.isError === true }
    }

    // An unknown workflow id falls back to the project's default and says so; the brief carries the step briefs, and no plan is asked for.
    const begun = await call('task_begin', { title: 'Add a toggle', workflow: 'nope' })
    expect(begun.text).toContain('there is no workflow "nope", so the project\'s default was used')
    expect(begun.text).toContain('Workflow: Reviewed')
    expect(begun.text).toContain('build "Build": Make the change.')
    expect(begun.text).toContain('ok "Your review": the person approves this before it can land. Look at the diff. See https://example.com/spec.')
    expect(begun.text).not.toContain('plan_submit')
    expect(await edit()).toBe('')

    // The track in the agent's Workflow tab: the plan was not needed, the build is in progress.
    await page.getByRole('tab', { name: 'Workflow' }).click()
    const track = page.getByRole('region', { name: 'Add a toggle: where ada is' }).first()
    const station = (name: string) => track.locator('.st', { hasText: name })
    await expect(station('Build')).toContainText('here now')
    await expect(station('Your review')).toContainText('not yet')
    await expect(track).toContainText('Reviewed')

    // A step that is not the agent's to report is refused; its own is accepted and then waits for the person.
    expect((await call('step_done', { step: 'land' })).error).toBe(true)
    const reported = await call('step_done', { step: 'build' })
    expect(reported.text).toContain('"Your review" now waits for the person')
    await post({ hook_event_name: 'Stop' })
    await expect(station('Your review')).toContainText('here now')
    await expect(track.getByRole('status')).toHaveText('needs your approval')
    await expect(page.locator('header').getByRole('button', { name: /Workflows/ })).toHaveAttribute('data-badge', '1').catch(() => undefined)

    // Landing is refused, in words, while the step is not approved.
    writeFileSync(join(ada!.cwd, 'toggle.ts'), 'export const dark = true\n')
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', 'add toggle')
    const land = () => page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }).then(() => 'landed', (e: Error) => e.message), ada!.id)
    expect(await land()).toContain('"Your review" has not been approved.')

    // The person sees it in the chat: sending it back types why into the agent.
    await page.getByRole('tab', { name: 'Chat' }).click()
    const panel = page.getByRole('region', { name: 'Step from ada' })
    await expect(panel).toContainText('Look at the diff.')
    // The brief is read as in the chat: an address in it is a link.
    await expect(panel.locator('a[href="https://example.com/spec"]')).toHaveCount(1)
    await panel.getByRole('button', { name: 'Send back' }).click()
    await panel.getByRole('textbox').fill('Please add a test.')
    await panel.getByRole('button', { name: 'Send back' }).click()
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log).toContainText('Your step "Your review" was sent back: Please add a test. Make the change, then call step_done again.', { timeout: 15_000 })
    await expect(panel).toBeHidden()

    // The agent reports again; the person approves; now it can land.
    expect((await call('step_done', {})).text).toContain('"Your review" now waits')
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: 'Approve' }).click()
    await expect(log).toContainText('Your step "Your review" was approved.', { timeout: 15_000 })
    await page.getByRole('tab', { name: 'Workflow' }).click()
    await expect(station('Your review')).toContainText('met')
    expect(await land()).toBe('landed')
    expect(git(repo, 'log', '--format=%s', 'main')).toContain('add toggle')
    await client.close()
  } finally {
    await shutdown()
  }
})
