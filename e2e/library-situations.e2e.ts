import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const skill = (dir: string, name: string, desc: string, body: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`)
}

const CONFLICT = 'Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.'

async function setup(extra: { rule?: object; agy?: boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aw-sit-'))
  const lib = join(home, 'aw', 'library')
  skill(join(lib, 'skills', 'resolving-merge-conflicts'), 'resolving-merge-conflicts', 'Resolve a git merge conflict.', '# Merge')
  mkdirSync(join(lib, 'playbooks'), { recursive: true })
  writeFileSync(join(lib, 'playbooks', 'global.json'), JSON.stringify({ rules: [
    { id: 'resolving-merge-conflicts', mode: 'on-demand', when: 'a merge stopped with conflict markers', strength: 'medium', also: ['merge-conflict'], ...extra.rule }
  ] }))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), AW_AGY_BIN: resolve(__dirname, 'fake-agy.mjs'), AW_AGY_HOME: join(home, 'agy'), FAKE_ENV_FILE: join(home, 'env.log'), FAKE_ARGS: args, FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, home)
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
  await page.reload()
  await hire(page)
  await expect.poll(() => readFileSync(args, 'utf8').includes('--settings')).toBe(true)
  const line = readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
  const hooks = JSON.parse(readFileSync(line[line.indexOf('--settings') + 1]!, 'utf8')).hooks
  const hook = hooks.UserPromptSubmit[0].hooks[0] as { url: string; headers: Record<string, string> }
  const post = async (body: object) => (await (await fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: 's1', ...body }) })).text()) || ''
  const tool = async (command: string, output: string) => post({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: output, stderr: '' }, tool_use_id: `t${Math.random()}` })
  const uses = () => readFileSync(join(lib, 'uses.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>)
  return { home, page, shutdown, post, tool, uses }
}

test('there is one switch for the playbook, and the check before acting is part of it', async () => {
  const { page, shutdown } = await setup()
  try {
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByRole('tab', { name: /Features/ }).click()
    await expect(settings.getByRole('checkbox', { name: /Library and playbook/ })).toBeChecked()
    await expect(settings.getByRole('checkbox', { name: /Check before acting/ })).toHaveCount(0)
  } finally {
    await shutdown()
  }
})

test('a merge conflict in the middle of a run points the agent at the skill once, and the log says why', async () => {
  const { shutdown, tool, post, uses } = await setup()
  try {
    // Nothing special in a normal tool result.
    expect(await tool('git status', 'On branch main\nnothing to commit')).toBe('')
    // A conflict: the line names the skill, how to read it, and that a trivial one may be passed over with a reason.
    const out = JSON.parse(await tool('git merge feature', CONFLICT)).hookSpecificOutput
    expect(out.hookEventName).toBe('PostToolUse')
    expect(out.additionalContext).toContain('resolving-merge-conflicts')
    expect(out.additionalContext).toContain("library_get('resolving-merge-conflicts')")
    expect(out.additionalContext).toContain('library_skip')
    // The same conflict being worked on is not announced again on every call.
    expect(await tool('git status', 'Unmerged paths:\n  both modified: a.txt')).toBe('')
    // The log keeps it as pointed, with the reason it was pointed.
    const rows = uses().filter((u) => u.id === 'resolving-merge-conflicts' && u.how === 'triggered')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.because).toMatch(/merge conflict/i)
    // Once the agent has read the skill, a later conflict is not pointed at again.
    await post({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'resolving-merge-conflicts' } })
    expect(await tool('git merge other', CONFLICT)).toBe('')
  } finally {
    await shutdown()
  }
})

test('a rule that does not list the situation is left alone', async () => {
  const { shutdown, tool } = await setup({ rule: { also: [] } })
  try {
    expect(await tool('git merge feature', CONFLICT)).toBe('')
  } finally {
    await shutdown()
  }
})

test('failing checks are pointed at when the same red shows twice, not the first', async () => {
  const { shutdown, tool } = await setup({ rule: { also: ['failing-checks'] } })
  try {
    const red = ' Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 10 passed (12)'
    expect(await tool('pnpm test', red)).toBe('')
    const out = JSON.parse(await tool('pnpm test', red)).hookSpecificOutput
    expect(out.additionalContext).toContain('failing test or type check')
    expect(out.additionalContext).toContain('resolving-merge-conflicts')
  } finally {
    await shutdown()
  }
})

test('an agy agent is pointed at the skill when a tool result it got shows a conflict, before its next model call', async () => {
  const { home, page, shutdown, uses } = await setup()
  try {
    await page.locator('header').getByRole('button', { name: '+ Agent' }).click()
    const form = page.getByRole('form', { name: 'Hire an agent' })
    await form.getByRole('radio', { name: /agy/ }).check()
    await form.getByLabel('Name').fill('bob')
    await form.getByRole('button', { name: 'Hire' }).click()
    await form.waitFor({ state: 'detached' })
    const envLog = join(home, 'env.log')
    await expect.poll(() => (existsSync(envLog) ? readFileSync(envLog, 'utf8') : '').split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).length).toBeGreaterThan(0)
    const started = JSON.parse(readFileSync(envLog, 'utf8').split('\n').filter((l) => /"token":"[0-9a-f]+"/.test(l)).at(-1)!) as { url: string; token: string }
    const transcript = join(home, 'agy', 'brain', 'conv-9', '.system_generated', 'logs', 'transcript_full.jsonl')
    mkdirSync(join(transcript, '..'), { recursive: true })
    const step = (n: number, type: string, source: string, content: string) => JSON.stringify({ step_index: String(n), source, type, content }) + '\n'
    writeFileSync(transcript, step(0, 'USER_INPUT', 'USER_EXPLICIT', '<USER_REQUEST>\nmerge the feature branch\n</USER_REQUEST>'))
    const call = async () => (await (await fetch(started.url.replace(/\/mcp$/, '/hook/pre-inv'), { method: 'POST', headers: { authorization: `Bearer ${started.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ conversationId: 'conv-9', transcriptPath: transcript }) })).json()) as { injectSteps?: { ephemeralMessage: string }[] }
    expect(await call()).toEqual({})
    appendFileSync(transcript, step(2, 'RUN_COMMAND', 'MODEL', `Created At: x\nThe command exited with code 1.\nOutput:\n${CONFLICT}`))
    const got = await call()
    expect(got.injectSteps![0]!.ephemeralMessage).toContain('merge conflict, 1 file')
    expect(got.injectSteps![0]!.ephemeralMessage).toContain('SKILL.md')
    expect(uses().filter((u) => u.how === 'triggered' && u.provider === 'agy')).toMatchObject([{ id: 'resolving-merge-conflicts', because: 'merge conflict, 1 file' }])
    expect(await call()).toEqual({})
  } finally {
    await shutdown()
  }
})

test('chat: a slip beside the message says the skill was pointed at because of a merge conflict met mid-run, then read', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aw-sitchat-'))
  const args = join(home, 'args.log')
  const lib = join(home, 'aw', 'library')
  skill(join(lib, 'skills', 'resolving-merge-conflicts'), 'resolving-merge-conflicts', 'Resolve a git merge conflict.', '# Merge')
  mkdirSync(join(lib, 'playbooks'), { recursive: true })
  writeFileSync(join(lib, 'playbooks', 'global.json'), JSON.stringify({ rules: [{ id: 'resolving-merge-conflicts', mode: 'on-demand', when: 'a merge stopped with conflict markers', strength: 'medium', also: ['merge-conflict'] }] }))
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_USER_HOME: join(home, 'user'), AW_CLAUDE_PROJECTS: join(home, 'projects'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '100', FAKE_CHAT: '1', FAKE_TRANSCRIPT: '1' }, home)
  try {
    const page = await app.firstWindow()
    await page.setViewportSize({ width: Number(process.env.VW ?? 1400), height: 1000 })
    await page.evaluate((f) => localStorage.setItem('aw.folder', f), home)
    await page.reload()
    await hire(page)
    await page.getByRole('tab', { name: 'Chat' }).click()
    const box = page.getByRole('textbox', { name: 'Message ada' })
    await box.fill('merge the feature branch into main')
    await box.press('Enter')
    const log = page.getByRole('log', { name: 'Conversation with ada' })
    await expect(log.locator('.msg.assistant').first()).toBeVisible()
    await expect.poll(() => readFileSync(args, 'utf8').includes('--settings')).toBe(true)
    const line = readFileSync(args, 'utf8').split('\n').filter((l) => l.startsWith('[')).map((l) => JSON.parse(l) as string[]).find((a) => a.includes('--settings'))!
    const hook = JSON.parse(readFileSync(line[line.indexOf('--settings') + 1]!, 'utf8')).hooks.UserPromptSubmit[0].hooks[0] as { url: string; headers: Record<string, string> }
    const session_id = line[line.indexOf('--session-id') + 1]
    const post = (body: object) => fetch(hook.url, { method: 'POST', headers: { ...hook.headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id, ...body }) })
    await page.waitForTimeout(800)
    await post({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'git merge feature' }, tool_response: { stdout: CONFLICT }, tool_use_id: 't1' })
    await page.waitForTimeout(800)
    // It stands with the step it came from, not with the message that began the run.
    const slips = log.locator('.turn.step').getByLabel('What the library did here')
    const note = slips.getByRole('button', { name: /resolving-merge-conflicts/ })
    await expect(log.locator('.turn:not(.step)').getByRole('button', { name: /resolving-merge-conflicts/ })).toHaveCount(0)
    await expect(note).toContainText('pointed because of a merge conflict, 1 file, not read')
    await post({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: 'resolving-merge-conflicts' } })
    await expect(note).toContainText('pointed because of a merge conflict, 1 file, then read')
    await note.click()
    await expect(log.getByRole('group', { name: 'resolving-merge-conflicts, the words' })).toContainText('merge conflict, 1 file was found')
    // In a chat wide enough for a margin the card stands beside its step, level with it, and not under it.
    await page.addStyleTag({ content: '.chat-log { width: 1000px !important; max-width: none !important; flex: none !important; }' })
    const step = await log.locator('.turn.step > .turn-row').boundingBox()
    const card = await slips.boundingBox()
    expect(card!.x).toBeGreaterThan(step!.x + step!.width - 1)
    expect(card!.y).toBeLessThan(step!.y + step!.height)
    await log.screenshot({ path: process.env.SHOT ?? join(home, 'slip.png') })
  } finally {
    await shutdown()
  }
})
