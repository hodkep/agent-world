#!/usr/bin/env node
// Stand-in for the claude CLI: reads the hook settings it is launched with and replays a
// scripted session through them, so the app can be exercised without spending tokens.
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name) => args[args.indexOf(name) + 1]
const settings = JSON.parse(readFileSync(flag('--settings'), 'utf8'))
let sessionId = flag('--session-id') ?? flag('--resume')
const { url, headers } = settings.hooks.PreToolUse[0].hooks[0]
const pause = Number(process.env.FAKE_DELAY_MS ?? 150)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const hook = async (event, extra = {}) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: event, ...extra })
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

console.log(`fake claude · session ${sessionId} · cwd ${process.cwd()}`)
console.log(`args: ${args.filter((a) => a.startsWith('--') && !['--settings', '--mcp-config', '--session-id', '--resume', '--name'].includes(a)).map((a) => `${a} ${args[args.indexOf(a) + 1]?.startsWith('--') ? '' : (args[args.indexOf(a) + 1] ?? '')}`).join(' ')}`)
await hook('SessionStart', { source: 'startup' })
// Like real Claude: a killed session still reports SessionEnd on its way out.
for (const sig of ['SIGHUP', 'SIGTERM']) process.on(sig, () => void hook('SessionEnd', { reason: 'other' }).finally(() => process.exit(0)))
// FAKE_COST=0.9 posts one statusline update the way Claude's statusline command would.
if (process.env.FAKE_COST) {
  const status = /(http\S+\/status)/.exec(settings.statusLine.command)[1]
  const res = await fetch(status, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, model: { display_name: 'Sonnet' }, context_window: { used_percentage: 42 }, cost: { total_cost_usd: Number(process.env.FAKE_COST), total_lines_added: 12, total_lines_removed: 3 } })
  })
  console.log(`status bar: ${await res.text()}`)
}
// Echo typed or pasted input, so delivered messages are visible in this terminal.
process.stdin.setRawMode?.(true)
process.stdin.on('data', (d) => process.env.FAKE_PLAN || process.env.FAKE_TERMINAL_PROMPT || process.stdout.write(String(d).replace(/\x1b\[20[01]~/g, '')))

// FAKE_SEND=ada:linus:text makes the agent named ada message linus through the office MCP server.
async function sendViaOffice(to, message) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const server = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world']
  const client = new Client({ name: 'fake-claude', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }))
  const r = await client.callTool({ name: 'send_message', arguments: { to, message } })
  console.log(`send_message → ${r.content[0].text}`)
  await client.close()
}
const [sendFrom, sendTo, ...sendText] = (process.env.FAKE_SEND ?? '').split(':')
const myName = args.includes('--name') ? flag('--name') : null

// FAKE_LOOP=1: endless varied work with no permission prompts, for demos and screenshots.
if (process.env.FAKE_LOOP) {
  const steps = [
    ['UserPromptSubmit', { prompt: 'next task' }],
    ['PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'TODO' } }],
    ['PreToolUse', { tool_name: 'Read', tool_input: { file_path: `${process.cwd()}/src/app.ts` } }],
    ['PreToolUse', { tool_name: 'Edit', tool_input: { file_path: `${process.cwd()}/src/app.ts` } }],
    ['PreToolUse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } }],
    ['PreToolUse', { tool_name: 'Agent', tool_input: { description: 'explore' } }],
    ['SubagentStart', { agent_id: 'sub-a', agent_type: 'Explore' }],
    ['PreToolUse', { agent_id: 'sub-a', tool_name: 'Glob', tool_input: { pattern: '**/*.ts' } }],
    ['SubagentStart', { agent_id: 'sub-b', agent_type: 'Plan' }],
    ['PreToolUse', { agent_id: 'sub-b', tool_name: 'Read', tool_input: { file_path: 'README.md' } }],
    ['SubagentStop', { agent_id: 'sub-a' }],
    ['SubagentStop', { agent_id: 'sub-b' }],
    ['PreToolUse', { tool_name: 'Write', tool_input: { file_path: `${process.cwd()}/src/health.ts` } }],
    ['Stop', {}],
    ['Notification', { notification_type: 'idle_prompt' }]
  ]
  // FAKE_ASK=1 adds a blocking permission request to the loop.
  if (process.env.FAKE_ASK) steps.splice(5, 0, ['PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } }])
  let i = Math.floor(Math.random() * steps.length)
  for (;;) {
    const [event, extra] = steps[i++ % steps.length]
    await hook(event, extra)
    await sleep(pause * (0.6 + Math.random()))
  }
}
await hook('UserPromptSubmit', { prompt: 'add a health check' })
await sleep(pause)
await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'router' } })
await sleep(pause)
await hook('SubagentStart', { agent_id: 'sub-1', agent_type: 'Explore' })
await hook('PreToolUse', { agent_id: 'sub-1', tool_name: 'Read', tool_input: { file_path: `${process.cwd()}/README.md` } })
await sleep(pause)
await hook('SubagentStop', { agent_id: 'sub-1' })
await hook('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: `${process.cwd()}/src/health.ts` } })
await sleep(pause)
// FAKE_TERMINAL_PROMPT=1: like Claude 2.1.28x, show our own permission menu while the hook is pending,
// and let the user answer it in the terminal; the hook call is then left unused.
if (process.env.FAKE_TERMINAL_PROMPT) {
  void hook('PermissionRequest', { tool_name: 'Bash', tool_use_id: 'tu-1', tool_input: { command: 'pnpm test' } })
  process.stdout.write('\r\n Do you want to proceed?\r\n ❯ 1. Yes\r\n   2. No, and tell Claude what to do differently\r\n')
  await new Promise((resolve) => {
    const onKey = (d) => {
      if (String(d) !== '\r') return
      process.stdin.off('data', onKey)
      process.stdout.write('\x1b[2J\x1b[H approved in terminal, running pnpm test\r\n')
      resolve()
    }
    process.stdin.on('data', onKey)
  })
  await sleep(3000)
  await hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tu-1' })
}
const answer = process.env.FAKE_TERMINAL_PROMPT ? null : await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
console.log(`decision: ${answer?.hookSpecificOutput?.decision?.behavior ?? 'ask-in-terminal'}`)
await hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
await sleep(pause)
if (myName && myName === sendFrom) {
  await hook('PreToolUse', { tool_name: 'mcp__agent-world__send_message', tool_input: { to: sendTo, message: sendText.join(':') } })
  await sendViaOffice(sendTo, sendText.join(':'))
}
// FAKE_PLAN=1: plan mode — tasks, a plan, then Claude's plan menu drawn in the terminal and driven by keys.
if (process.env.FAKE_PLAN) {
  const pm = { permission_mode: 'plan' }
  for (const [id, subject] of [['1', 'Write hello.txt'], ['2', 'Check it']])
    await hook('PostToolUse', { ...pm, tool_name: 'TaskCreate', tool_input: { subject }, tool_response: { task: { id, subject } } })
  await hook('PostToolUse', { ...pm, tool_name: 'TaskUpdate', tool_input: { taskId: '1', status: 'in_progress' }, tool_response: { success: true, taskId: '1', statusChange: { from: 'pending', to: 'in_progress' } } })
  const plan = '# Plan: add hello.txt\n\n## Steps\n1. Create hello.txt with hi.\n2. Run cat hello.txt.'
  await hook('PreToolUse', { ...pm, tool_name: 'ExitPlanMode', tool_input: { plan } })
  await hook('PermissionRequest', { ...pm, tool_name: 'ExitPlanMode', tool_input: { plan } })
  const options = ['Yes, auto-accept edits', 'Yes, manually approve edits', 'Tell Claude what to change']
  let at = 0
  const draw = () =>
    process.stdout.write(
      `\x1b[2J\x1b[H Claude has written up a plan and is ready to execute. Would\r\n you like to proceed?\r\n` +
        options.map((o, i) => `${i === at ? ' ❯' : '  '} ${i + 1}. ${o}`).join('\r\n') + '\r\n'
    )
  draw()
  await new Promise((resolve) => {
    process.stdin.setRawMode?.(true)
    const onKey = (d) => {
      const k = String(d)
      if (k === '\x1b[B') at = Math.min(2, at + 1)
      else if (k === '\x1b[A') at = Math.max(0, at - 1)
      else if (k === '\r') {
        process.stdin.off('data', onKey)
        process.stdout.write(`\x1b[2J\x1b[Hchose option ${at + 1}\r\n`)
        return resolve()
      }
      draw()
    }
    process.stdin.on('data', onKey)
  })
}
await hook('Stop')
// FAKE_CLEAR=1: behave like /clear — a new Claude session id in the same terminal, then more work.
if (process.env.FAKE_CLEAR) {
  sessionId = `cleared-${sessionId}`
  await hook('SessionStart', { source: 'clear' })
  await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'after-clear' } })
}
console.log('done, waiting for input')
