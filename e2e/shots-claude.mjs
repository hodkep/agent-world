#!/usr/bin/env node
// A scripted stand-in for claude for the README shots (pnpm shots). What each agent is doing is chosen by its name in SHOTS_SCENES
// ({"ada":"thinking", …}), so one office can show every activity at once; an agent with no scene behaves as the ordinary fake claude (fake-claude.mjs),
// with whatever FAKE_* switches the shot set.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const scenes = JSON.parse(process.env.SHOTS_SCENES ?? '{}')
const scene = scenes[flag('--name') ?? '']
if (!scene || args[0] === '--version' || args[0] === 'auth' || args[0] === 'mcp' || args[0] === 'plugin' || args[0] === '-p') {
  await import('./fake-claude.mjs')
} else {
  const settings = JSON.parse(readFileSync(flag('--settings'), 'utf8'))
  const { url, headers } = settings.hooks.PreToolUse[0].hooks[0]
  const sessionId = flag('--session-id') ?? flag('--resume')
  const hook = async (event, extra = {}) => {
    const res = await fetch(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: event, ...extra }) })
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const cwd = process.cwd()
  console.log(`shots claude · ${scene} · ${cwd}`)
  await hook('SessionStart', { source: 'startup' })
  const work = async (prompt) => (await hook('UserPromptSubmit', { prompt }), await sleep(150))
  if (scene === 'asleep') {
    // The session ends: the app shows the agent asleep.
    await hook('SessionEnd', { reason: 'other' })
    process.exit(0)
  }
  if (scene === 'idle') await hook('Stop')
  if (scene === 'waiting') {
    await work('which database should the orders use?')
    await hook('Stop')
    await hook('Notification', { notification_type: 'idle_prompt' })
  }
  if (scene === 'thinking') await work('plan the checkout page')
  if (scene === 'researching') {
    await work('find where the cart total is computed')
    await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'cartTotal' } })
  }
  if (scene === 'implementing') {
    await work('add a health check')
    await hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: `${cwd}/src/health.ts` } })
  }
  if (scene === 'running') {
    await work('run the tests')
    await hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
  }
  if (scene === 'delegating') {
    await work('look into the three failing specs')
    await hook('PreToolUse', { tool_name: 'Agent', tool_input: { description: 'explore the specs' } })
    for (const [id, type] of [['sub-1', 'Explore'], ['sub-2', 'Plan']]) {
      await hook('SubagentStart', { agent_id: id, agent_type: type })
      await hook('PreToolUse', { agent_id: id, tool_name: 'Read', tool_input: { file_path: `${cwd}/README.md` } })
    }
  }
  if (scene === 'story') {
    // The hero: paced like a short story, so a recording shows work, then a request that waits for the person, then the work carrying on.
    await sleep(2200)
    await work('add a health check')
    await sleep(1500)
    await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'health' } })
    await sleep(1200)
    await hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: `${cwd}/src/health.ts` } })
    await sleep(1300)
    const answer = await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'pnpm test', description: 'Run the tests' } })
    console.log(`decision: ${answer?.hookSpecificOutput?.decision?.behavior ?? 'ask-in-terminal'}`)
    await hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
    await sleep(1800)
    await hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
    await hook('Stop')
  }
  if (scene === 'permission') {
    await work('clean the build output')
    // The request waits for the person: the call comes back with the answer when it is given, then the agent finishes.
    const answer = await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf dist', description: 'Remove the build output' } })
    console.log(`decision: ${answer?.hookSpecificOutput?.decision?.behavior ?? 'ask-in-terminal'}`)
    await hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } })
    await sleep(800)
    await hook('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } })
    await hook('Stop')
  }
  process.stdin.setRawMode?.(true)
  process.stdin.resume()
  await new Promise(() => {})
}
