import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const flow = (run: string, retries = 1) => ({
  version: 1,
  id: 'checked',
  name: 'Checked',
  steps: [
    { id: 'plan', kind: 'plan', gate: 'auto' },
    { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change.' },
    { id: 'tests', kind: 'check', name: 'Tests pass', run, gate: 'pass', retries },
    { id: 'land', kind: 'merge', gate: 'auto' }
  ]
})

async function session(o: { run?: string; retries?: number } = {}) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfchk-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
  const file = join(repo, '.agent-world', 'workflows', 'checked.json')
  writeFileSync(file, JSON.stringify(flow(o.run ?? 'test -f ok.txt', o.retries ?? 1)))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'preferences.json'), JSON.stringify({ setup: { done: true, defaultProvider: 'claude' }, workflows: { enabled: true, dial: 'balanced', since: 1, defaults: { [repo]: 'checked' } } }))
  const argsLog = join(tmp, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: home, AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, tmp)
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
  const stop = () => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: flag('--session-id'), cwd: ada!.cwd, hook_event_name: 'Stop' }) })
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
    return { text: r.content[0]!.text, error: r.isError === true }
  }
  const land = () => page.evaluate((id) => window.aw.finishRun(id, { squash: false, message: '', cleanup: false }).then(() => 'landed', (e: Error) => e.message), ada!.id)
  const commit = (name: string, text = 'x\n') => {
    writeFileSync(join(ada!.cwd, name), text)
    git(ada!.cwd, 'add', '-A')
    git(ada!.cwd, 'commit', '-qm', `add ${name}`)
  }
  await page.getByRole('tab', { name: 'Chat' }).click()
  const log = page.getByRole('log', { name: 'Conversation with ada' })
  // What the office types into the agent waits for the end of its turn: end it while looking.
  const heard = (text: string) =>
    expect
      .poll(async () => {
        await stop()
        return log.innerText()
      }, { timeout: 25_000 })
      .toContain(text)
  return { heard, page, ada: ada!, repo, file, git, call, land, commit, log, shutdown, client, home }
}

test('a project\'s check asks for approval of its commands, runs them, sends a failure back to the agent, passes after the fix, and landing waits for it; a changed file asks again with what changed', async () => {
  const s = await session()
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    expect((await s.call('step_done', { step: 'build' })).text).toContain('The app is running the checks that follow')

    // The commands wait for the person's approval: nothing has run, and landing says why.
    const ask = s.page.getByRole('region', { name: 'Commands from Checked' })
    await expect(ask).toContainText('test -f ok.txt')
    await expect(ask).toContainText(s.file)
    await expect(ask).toContainText('this exact version of the file')
    s.commit('toggle.ts')
    expect(await s.land()).toContain('"Tests pass" has not run: its commands are not approved.')

    // Approved: it runs, fails (no ok.txt yet), and the agent is sent why.
    await ask.getByRole('button', { name: 'Approve and run' }).click()
    await s.heard('The check "Tests pass" failed (try 1 of 2)')
    await s.heard('test -f ok.txt exited with 1.')
    await s.heard('Fix it, commit, then call step_done again.')
    await s.page.getByRole('tab', { name: 'Workflow' }).click()
    // These look at the rail; the tab shows the flow first.
    await s.page.getByRole('button', { name: 'Rail' }).click()
    const tests = s.page.getByRole('region', { name: /where ada is/ }).first().locator('.st', { hasText: 'Tests pass' })
    await expect(tests).toContainText('failed once')
    expect(await s.land()).toContain('"Tests pass" has not passed for the branch as it is now.')

    // The agent fixes it, reports again, and it passes; landing is then allowed.
    s.commit('ok.txt')
    expect((await s.call('step_done')).text).toContain('running the checks')
    await expect(tests).toContainText('met after trouble', { timeout: 20_000 })
    // It passed, and the track still says it failed once on the way.
    await expect(tests).toContainText('failed once')
    expect(await s.land()).toBe('landed')
    expect(s.git(s.repo, 'log', '--format=%s', 'main')).toContain('add ok.txt')

    // The file changes: the next task asks again, and shows what is new compared with the version that was approved.
    writeFileSync(s.file, JSON.stringify(flow('test -f ok.txt && echo uploaded')))
    await s.call('task_begin', { title: 'Another change' })
    await s.call('step_done', { step: 'build' })
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    const again = s.page.getByRole('region', { name: 'Commands from Checked' })
    const diff = again.getByLabel('What changed since the version you approved')
    await expect(diff).toContainText('+ test -f ok.txt && echo uploaded')
    await expect(diff).toContainText('- test -f ok.txt')
    await expect(again).toContainText('The added commands are new')
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('a check that never passes runs out of tries, the person is asked, can skip it, and landing then goes ahead; declining the commands holds landing by name until they are approved', async () => {
  const s = await session({ run: 'echo broken >&2; exit 2' })
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    await s.call('step_done', { step: 'build' })
    s.commit('toggle.ts')
    const ask = s.page.getByRole('region', { name: 'Commands from Checked' })

    // Declined: the check does not run; landing names it; the panel offers to approve after all.
    await ask.getByRole('button', { name: "Don't run" }).click()
    await expect(s.page.getByRole('region', { name: 'Commands from Checked' })).toContainText('You did not approve these commands')
    expect(await s.land()).toContain('"Tests pass" did not run: you declined its commands.')
    await s.page.getByRole('region', { name: 'Commands from Checked' }).getByRole('button', { name: 'Approve and run' }).click()

    // Two tries, both fail: the agent is told the person was asked; the panel shows what it printed.
    await s.heard('failed (try 1 of 2)')
    s.commit('more.ts')
    expect((await s.call('step_done')).text).toContain('running the checks')
    await s.heard('still fails after 2 tries')
    const failed = s.page.getByRole('region', { name: 'Check from ada' })
    await expect(failed).toContainText('Tests pass failed 2 times')
    await expect(failed.getByLabel('What it printed last')).toContainText('broken')
    expect(await s.land()).toContain('"Tests pass" failed after 2 tries.')

    // Skipping it lets landing go ahead, and the agent hears about it.
    await failed.getByRole('button', { name: 'Skip this check' }).click()
    await s.heard('The person skipped the check "Tests pass".')
    expect(await s.land()).toBe('landed')
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('approving the commands of a check that passes tells the agent and the chat, so the person is not left with no sign', async () => {
  const s = await session({ run: 'echo fine' })
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    await s.call('step_done', { step: 'build' })
    await s.heard('waits for the person to approve its commands')
    await s.page.getByRole('region', { name: 'Commands from Checked' }).getByRole('button', { name: 'Approve and run' }).click()
    await s.heard('The person approved the commands and the check "Tests pass" passed (echo fine')
    await expect(s.page.getByRole('region', { name: 'Commands from Checked' })).toHaveCount(0)
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('an agent that reports its step and then the task does not use a second try on the same commit', async () => {
  const s = await session({ run: 'echo nope >&2; exit 1', retries: 2 })
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    await s.call('step_done', { step: 'build' })
    s.commit('toggle.ts')
    await s.page.getByRole('region', { name: 'Commands from Checked' }).getByRole('button', { name: 'Approve and run' }).click()
    await s.heard('failed (try 1 of 3)')
    // The agent now says the task is done without a fix: the same commit is not checked again.
    await s.call('task_done', { summary: 'done' })
    await new Promise((r) => setTimeout(r, 2500))
    await s.page.getByRole('tab', { name: 'Workflow' }).click()
    // These look at the rail; the tab shows the flow first.
    await s.page.getByRole('button', { name: 'Rail' }).click()
    await expect(s.page.getByRole('region', { name: /where ada is/ }).first().locator('.st', { hasText: 'Tests pass' })).toContainText('failed once')
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    expect(await s.log.innerText()).not.toContain('try 2 of 3')
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('an agent that closed the task before it heard its check had failed can still report its fix, and the check passes', async () => {
  const s = await session()
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    await s.call('step_done', { step: 'build' })
    s.commit('toggle.ts')
    await s.page.getByRole('region', { name: 'Commands from Checked' }).getByRole('button', { name: 'Approve and run' }).click()
    await s.heard('failed (try 1 of 2)')
    // The agent said the task was done in the same turn, before the failure reached it.
    await s.call('task_done', { summary: 'done' })
    s.commit('ok.txt')
    expect((await s.call('step_done', { step: 'build' })).text).toContain('running the checks')
    await s.page.getByRole('tab', { name: 'Workflow' }).click()
    // These look at the rail; the tab shows the flow first.
    await s.page.getByRole('button', { name: 'Rail' }).click()
    await expect(s.page.getByRole('region', { name: /where ada is/ }).first().locator('.st', { hasText: 'Tests pass' })).toContainText('met after trouble', { timeout: 20_000 })
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})

test('a follow-up round after the task finished reads the workflow file again: a changed file asks for its commands again, as a new task would', async () => {
  const s = await session({ run: 'true' })
  try {
    await s.call('task_begin', { title: 'Add a toggle' })
    await s.call('step_done', { step: 'build' })
    const ask = s.page.getByRole('region', { name: 'Commands from Checked' })
    await ask.getByRole('button', { name: 'Approve and run' }).click()
    await expect(ask).toHaveCount(0)
    await s.call('task_done', { summary: 'Toggle added.' })

    // The file is edited; the agent is asked for more on the same task, as a follow-up round.
    writeFileSync(s.file, JSON.stringify(flow('true && echo uploaded')))
    await s.call('task_begin', { title: 'Missed the settings page', follow_up: true })
    await s.call('step_done', { step: 'build' })
    await s.page.getByRole('tab', { name: 'Chat' }).click()
    const again = s.page.getByRole('region', { name: 'Commands from Checked' })
    await expect(again.getByLabel('What changed since the version you approved')).toContainText('+ true && echo uploaded', { timeout: 20_000 })
    await s.client.close()
  } finally {
    await s.shutdown()
  }
})
