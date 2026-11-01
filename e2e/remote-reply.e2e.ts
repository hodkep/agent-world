import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'
import { readLog } from './readLog'

// While a task is open the hook adds its own reminder to every reply; "nothing decided" means none of the decision words.
const DECIDED = /was approved|pressed Run|refused your step|not exactly a decision|still open|needs what to change/
const quiet = (s: string) => expect(s).not.toMatch(DECIDED)

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
    writeFileSync(join(repo, '.agent-world', 'workflows', 'skippy.json'), JSON.stringify(SKIPPY))
    writeFileSync(join(repo, '.agent-world', 'workflows', 'verifying.json'), JSON.stringify(VERIFYING))
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
  // Its chat is the one on screen. The window learns of an agent added by the API when it is drawn again.
  const showChat = async () => {
    await page.reload()
    await page.getByText('ada', { exact: true }).first().click()
    await page.getByRole('tab', { name: 'Chat' }).click()
  }
  const planState = async () => (await page.evaluate(() => window.aw.workflows.summary())).runs[0]?.rounds.at(-1)?.plan?.state
  return { page, shutdown, submit, reply, forge, planState, text, call, showChat }
}

const REVIEWED = { version: 1, id: 'reviewed', name: 'Reviewed', when: 'Changes that need a second look.', steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change.' }, { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' }, { id: 'land', kind: 'merge' }] }

const SKIPPY = { version: 1, id: 'skippy', name: 'Skippy', when: 'Changes with a step that may be skipped.', steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build', optional: true, brief: 'Make the change.' }, { id: 'ok', kind: 'approve', name: 'Your review', brief: 'Look at the diff.' }] }

const VERIFYING = { version: 1, id: 'verifying', name: 'Verifying', when: 'Changes the person tries themselves.', steps: [{ id: 'plan', kind: 'plan', gate: 'auto' }, { id: 'build', kind: 'work', name: 'Build', brief: 'Make the change.' }, { id: 'verify', kind: 'work', name: 'Verify', by: 'person', confirm: 'Tested, looks good', start: 'run', brief: 'Start a test instance and give the test prompts.' }, { id: 'ship', kind: 'work', name: 'Ship', start: 'run', brief: 'Hand it over.' }] }

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
    quiet(await t.reply('looks good, go ahead'))
    expect(await t.reply(`Apptoved ${code}`)).toContain('not exactly a decision')
    // The right words with a wrong code decide nothing either.
    quiet(await t.reply('approve zzz'))
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
    quiet(await t.reply(`approve ${code} 1=2`))
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
    quiet(await t.reply('approve abc 1=1'))
    expect(await t.planState()).toBe('submitted')
  } finally {
    await t.shutdown()
  }
})

test('with remote control on, a step that asks before it starts is decided by typing: approve is the person\'s Run, changes is Not now with its reason, and each answer is told to the agent as the card tells it', async () => {
  const t = await setup(true, true)
  try {
    await t.call('task_begin', { title: 'Add a toggle', workflow: 'reviewed' })
    const told = await t.call('step_done', { step: 'build' })
    const wait = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(told).toContain('"Your review" now waits for the person')
    expect(wait).toBeTruthy()
    expect(told).toContain(`\`changes ${wait}: why not\``)
    // Not now needs its reason, and a step that is not optional then fails: the workflow stops there and the agent is told.
    expect(await t.reply(`changes ${wait}`)).toContain('needs what to change')
    const refused = await t.reply(`changes ${wait}: not this change`)
    expect(refused).toContain('The person refused your step "Your review"')
    expect(refused).toContain('not this change')
    quiet(await t.reply(`approve ${wait}`))
    // The bar says Refused in a chip, with a button that asks again.
    await t.showChat()
    await expect(t.page.getByRole('status').filter({ hasText: 'Refused' })).toBeVisible({ timeout: 15_000 })
    await expect(t.page.getByRole('button', { name: 'Ask again', exact: true })).toBeVisible()
    if (process.env.AW_SHOTS) await t.page.screenshot({ path: `${process.env.AW_SHOTS}/ask-again.png` })
    // The refusal asks what next, and the agent was told the words for that at once.
    const next = /`later ([a-z0-9]{3})`/.exec(refused)?.[1]
    expect(next).toBeTruthy()
    expect(await t.reply(`later ${next}`)).toContain('again later')
  } finally {
    await t.shutdown()
  }
})

test('with remote control on, approve on a step that asks before it starts is the person\'s Run: the agent is told to start it, reports it, and the same words again do nothing', async () => {
  const t = await setup(true, true)
  try {
    await t.call('task_begin', { title: 'Add a toggle', workflow: 'reviewed' })
    const told = await t.call('step_done', { step: 'build' })
    const wait = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(wait).toBeTruthy()
    expect(await t.reply(`approve ${wait}`)).toContain('The person pressed Run: start your step "Your review" now.')
    quiet(await t.reply(`approve ${wait}`))
    expect((await t.call('step_done', { step: 'ok' }))).toContain('Step "ok" reported done.')
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

test('with remote control on, an agent\'s request to skip steps tells the person the words, and skip or keep answers it as the card does', async () => {
  for (const [word, told] of [['skip', 'approved skipping'], ['keep', 'kept']] as const) {
    const t = await setup(true, true)
    try {
      await t.call('task_begin', { title: 'Fix a typo', workflow: 'skippy' })
      const asked = await t.call('skip_steps', { steps: ['build'], why: 'only a comment changed' })
      const code = new RegExp(`\`${word} ([a-z0-9]{3})\``).exec(asked)?.[1]
      expect(code).toBeTruthy()
      expect(await t.reply(`${word} ${code}`)).toContain(told)
      // The question is answered once: the same words again do nothing.
      quiet(await t.reply(`${word} ${code}`))
    } finally {
      await t.shutdown()
    }
  }
})

test('a step the person finishes: the agent is told it ends with their verdict, then there is one card, with the step\'s own words, and nothing before it', async () => {
  const t = await setup(false, true)
  try {
    await t.call('task_begin', { title: 'Try a change', workflow: 'verifying' })
    const told = await t.call('step_done', { step: 'build' })
    // Its start on Run in the file is ignored: the person is not asked before it, and the agent is told what the step is.
    expect(told).toContain('Next step: "Verify"; it ends with the person\'s verdict: do what it says, then call step_done and wait for their answer.')
    expect(told).not.toContain('presses Run')
    await t.showChat()
    await expect(t.page.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0)
    // The agent gave its instructions and reports the step: now one card asks.
    expect(await t.call('step_done', { step: 'verify' })).toContain('"Verify" now waits for the person')
    const card = t.page.getByRole('region', { name: 'Step from ada' })
    await expect(card).toBeVisible({ timeout: 15_000 })
    await expect(t.page.locator('section.plan-gate')).toHaveCount(1)
    await expect(card.locator('.pg-tag')).toHaveText('Your verdict')
    await expect(card.getByRole('button', { name: 'Tested, looks good' })).toBeVisible()
    if (process.env.AW_SHOTS) await t.page.screenshot({ path: `${process.env.AW_SHOTS}/verdict-card.png` })
    await card.getByRole('button', { name: 'Tested, looks good' }).click()
    // The next step is the agent's, asked once before it starts: its Run card, and when it is pressed no other card follows.
    const run = t.page.getByRole('region', { name: 'Run Ship for ada' })
    await expect(run).toBeVisible({ timeout: 15_000 })
    await run.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(t.page.locator('section.plan-gate')).toHaveCount(0)
    await t.page.waitForTimeout(2500)
    await expect(t.page.locator('section.plan-gate')).toHaveCount(0)
  } finally {
    await t.shutdown()
  }
})

test('with remote control on, a step the person finishes is answered by typing approve, or changes with what to change', async () => {
  const t = await setup(true, true)
  try {
    await t.call('task_begin', { title: 'Try a change', workflow: 'verifying' })
    await t.call('step_done', { step: 'build' })
    const told = await t.call('step_done', { step: 'verify' })
    const code = /`approve ([a-z0-9]{3})`/.exec(told)?.[1]
    expect(code).toBeTruthy()
    expect(await t.reply(`changes ${code}`)).toContain('needs what to change')
    expect(await t.reply(`changes ${code}: the tab is blank`)).toContain('sent back: the tab is blank')
    // Sent back, it is the agent's again: it reports it once more and the person approves.
    const again = await t.call('step_done', { step: 'verify' })
    const code2 = /`approve ([a-z0-9]{3})`/.exec(again)?.[1]
    expect(code2).toBeTruthy()
    expect(await t.reply(`approve ${code2}`)).toContain('was approved')
  } finally {
    await t.shutdown()
  }
})
