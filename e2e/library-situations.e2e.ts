import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { hire, launchApp } from './launch'

const skill = (dir: string, name: string, desc: string, body: string) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n${body}`)
}

const CONFLICT = 'Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt\nAutomatic merge failed; fix conflicts and then commit the result.'

async function setup(extra: { rule?: object } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'aw-sit-'))
  const lib = join(home, 'aw', 'library')
  skill(join(lib, 'skills', 'resolving-merge-conflicts'), 'resolving-merge-conflicts', 'Resolve a git merge conflict.', '# Merge')
  mkdirSync(join(lib, 'playbooks'), { recursive: true })
  writeFileSync(join(lib, 'playbooks', 'global.json'), JSON.stringify({ rules: [
    { id: 'resolving-merge-conflicts', mode: 'on-demand', when: 'a merge stopped with conflict markers', strength: 'medium', also: ['merge-conflict'], ...extra.rule }
  ] }))
  const args = join(home, 'args.log')
  const { app, shutdown } = await launchApp({ AW_HOME: join(home, 'aw'), AW_CLAUDE_BIN: resolve(__dirname, 'fake-claude.mjs'), FAKE_ARGS: args, FAKE_DELAY_MS: '50', FAKE_CHAT: '1' }, home)
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
