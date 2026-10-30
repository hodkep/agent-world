import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

const BAD = '## Goal\nAdd a toggle.\n'
const GOOD = `## Goal
Add a dark-mode toggle to Settings, as in docs/mock.html and https://example.com/spec (not in src/nowhere.ts).

## Assumptions
- [given] The toggle lives in Settings.
- [guessed] The choice is saved in preferences.json.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window

## Steps
1. Add the setting.
`

async function setup(remote: boolean, withWorkflow = false) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'aw-wfreply-')))
  const repo = join(tmp, 'shop')
  mkdirSync(repo)
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8' }).trim()
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# shop\n')
  if (withWorkflow) {
    mkdirSync(join(repo, '.agent-world', 'workflows'), { recursive: true })
    writeFileSync(join(repo, '.agent-world', 'workflows', 'reviewed.json'), JSON.stringify(REVIEWED))
  }
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  mkdirSync(join(tmp, 'home'), { recursive: true })
  writeFileSync(join(tmp, 'home', 'preferences.json'), JSON.stringify({ workflows: { enabled: true, dial: 'balanced', since: 1 } }))
  const argsLog = join(tmp, 'args.log')
  const contextLog = join(tmp, 'context.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(tmp, 'home'), AW_CLAUDE_PROJECTS: join(tmp, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: argsLog, FAKE_DELAY_MS: '50', FAKE_PROMPT_HOOK: '1', FAKE_CONTEXT_LOG: contextLog }, tmp)
  const page = await app.firstWindow()
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), repo)
  await page.reload()
  const ada = await page.evaluate(async ([f, r]) => window.aw.addAgent(f as string, r ? { remote: true } : {}, 'ada'), [repo, remote] as const)
  await expect.poll(() => readLog(argsLog).includes('--settings')).toBe(true)
  const launch = readLog(argsLog).split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
  const flag = (f: string) => launch[launch.indexOf(f) + 1]!
  const mcpCfg = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world'] as { url: string; headers: Record<string, string> }
  const hook = JSON.parse(readFileSync(flag('--settings'), 'utf8')).hooks.PreToolUse[0].hooks[0] as { url: string; headers: Record<string, string> }
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpCfg.url), { requestInit: { headers: mcpCfg.headers } }))
  const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text
  // What the person types goes to the agent's program, which reports it to the office from its own process, as Claude does; the office's answer is what the program kept.
  const kept = () => (existsSync(contextLog) ? readFileSync(contextLog, 'utf8') : '').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { prompt?: string; context?: string; forged?: string; answer?: string })
  const reply = async (prompt: string) => {
    const before = kept().length
    await page.evaluate(([id, p]) => window.aw.chatSend(id!, p!), [ada.id, prompt])
    await expect.poll(() => kept().length, { timeout: 15_000 }).toBeGreaterThan(before)
    return kept().slice(before).find((k) => k.prompt === prompt)?.context ?? ''
  }
  // A command the agent itself runs, posting the same words to the same hook with the same token. It answers with what the office said.
  const forge = async (words: string) => {
    const before = kept().length
    await page.evaluate(([id, p]) => window.aw.chatSend(id!, p!), [ada.id, `forge ${words}`])
    await expect.poll(() => kept().filter((k) => k.forged).length, { timeout: 15_000 }).toBeGreaterThan(kept().slice(0, before).filter((k) => k.forged).length)
    return kept().filter((k) => k.forged).at(-1)!.answer ?? ''
  }
  const submit = async () => {
    await client.callTool({ name: 'task_begin', arguments: { title: 'Add a dark-mode toggle' } })
    mkdirSync(join(ada.cwd, '.agent-world'), { recursive: true })
    writeFileSync(join(ada.cwd, '.agent-world', 'plan.md'), PLAN)
    return text(await client.callTool({ name: 'plan_submit', arguments: {} }))
  }
  const call = async (name: string, args: Record<string, unknown>) => text(await client.callTool({ name, arguments: args }))
  const planState = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]?.rounds.at(-1)?.plan?.state
  return { page, shutdown, submit, reply, forge, planState, text, call }
}

const REVIEWED = { version: 1, id: 'reviewed', name: 'Reviewed', when: 'Changes that need a second look.', steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change.' }, { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' }, { id: 'land', kind: 'merge' }] }

const PLAN = `## Goal
Add a dark-mode toggle to Settings.

## Assumptions
- [given] The toggle lives in Settings.

## Out of scope
- A theme per project.

## Open questions
- Should the choice apply to every window, or only this one?
  - Every window
  - This window

## Steps
1. Add the setting.
`

test('with remote control on the agent is told the code to give the person, and the plan is decided by typing its word and code', async () => {
  const t = await setup(true)
  try {
    const told = await t.submit()
    const code = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(code).toBeTruthy()
    expect(told).toContain(`\`changes ${code}: what to change\``)
    expect(await t.planState()).toBe('submitted')

    // Ordinary talk and a typo decide nothing; the typo that names the code is told back.
    expect(await t.reply('looks good, go ahead')).toBe('')
    expect(await t.reply(`Apptoved ${code}`)).toContain('not exactly a decision')
    // The right words with a wrong code decide nothing either.
    expect(await t.reply('approve zzz')).toBe('')
    expect(await t.planState()).toBe('submitted')
    // Approving with the question still open is refused, and says what is missing.
    expect(await t.reply(`approve ${code}`)).toContain('still open')
    expect(await t.planState()).toBe('submitted')
    // Answering it by option number approves, and the agent is told what the card's button tells it.
    const done = await t.reply(`Approve ${code} 1=2`)
    expect(done).toContain('Your plan was approved')
    expect(done).toContain('This window')
    expect(await t.planState()).toBe('approved')
    // The decision was taken once: the same words again do nothing.
    expect(await t.reply(`approve ${code} 1=2`)).toBe('')
  } finally {
    await t.shutdown()
  }
})

test('with remote control off nothing is said about codes and typed words decide nothing', async () => {
  const t = await setup(false)
  try {
    const told = await t.submit()
    expect(told).not.toContain('remote control')
    expect(told).not.toMatch(/approve [a-z0-9]{3}/)
    // Even with the right words, whatever the code, the plan is still waiting.
    expect(await t.reply('approve abc 1=1')).toBe('')
    expect(await t.planState()).toBe('submitted')
  } finally {
    await t.shutdown()
  }
})

test('with remote control on, a step that waits for the person is decided by typing: changes needs its note, approve moves on, and each answer is told to the agent as the card tells it', async () => {
  const t = await setup(true, true)
  try {
    await t.call('task_begin', { title: 'Add a toggle', workflow: 'reviewed' })
    const told = await t.call('step_done', { step: 'build' })
    const wait = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(told).toContain('"Your review" now waits for the person')
    expect(wait).toBeTruthy()
    expect(told).toContain(`\`changes ${wait}: what to change\``)
    expect(await t.reply(`changes ${wait}`)).toContain('needs what to change')
    expect(await t.reply(`changes ${wait}: smaller commits`)).toContain('smaller commits')
    // The work was sent back: reported again, it waits under a new code (the old one decides nothing), and approving that one moves on.
    const again = await t.call('step_done', { step: 'build' })
    const second = /`approve ([a-z0-9]{3})`/.exec(again)?.[1]
    expect(second).toBeTruthy()
    expect(second).not.toBe(wait)
    expect(await t.reply(`approve ${wait}`)).toBe('')
    expect(await t.reply(`approve ${second}`)).toContain('Your review')
    expect(await t.reply(`approve ${second}`)).toBe('')
  } finally {
    await t.shutdown()
  }
})

test('a call the agent itself forges to its own hook, with its own token and the right code, decides nothing; the same words typed to the program do', async () => {
  const t = await setup(true)
  try {
    const told = await t.submit()
    const code = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(code).toBeTruthy()
    // As the agent would do it from a command it runs: the office answers the call and says nothing of any decision.
    const answer = await t.forge(`approve ${code} 1=1`)
    expect(answer).not.toContain('Your plan was approved')
    expect(await t.planState()).toBe('submitted')
    // The same words, reported by the program as the person's prompt, decide it.
    expect(await t.reply(`approve ${code} 1=1`)).toContain('Your plan was approved')
    expect(await t.planState()).toBe('approved')
  } finally {
    await t.shutdown()
  }
})
