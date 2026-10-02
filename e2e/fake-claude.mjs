#!/usr/bin/env node
// Stand-in for the claude CLI: reads the hook settings it is launched with and replays a
// scripted session through them, so the app can be exercised without spending tokens.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
// Background commands under the agent, like a dev server it started.
// FAKE_CHILD=n starts n of them (sleep 300, sleep 301, …).
for (let i = 0; i < Number(process.env.FAKE_CHILD ?? 0); i++) spawn('sh', ['-c', `sleep ${300 + i}; true`], { stdio: 'ignore' }).unref()
// Read-only subcommands the app runs to inspect the setup.
// FAKE_CALLS=<file>: log management calls so a test can check what the app asked for.
if (process.env.FAKE_CALLS && ['add', 'remove', 'enable', 'disable', 'uninstall'].includes(args[1])) (await import('node:fs')).appendFileSync(process.env.FAKE_CALLS, args.join(' ') + '\n')
if (args[0] === 'mcp') {
  console.log('Checking MCP server health…\n\nfake-docs: https://docs.example/mcp - ✔ Connected\nfake-db: npx fake-db - ✗ Failed to connect\nplugin:productivity:asana: https://mcp.asana.com/v2/mcp (HTTP) - ✘ Failed to connect — Incompatible auth server: does not support dynamic client registration')
  process.exit(0)
}
if (args[0] === 'plugin') {
  console.log(JSON.stringify([{ id: 'fake-plugin@market', version: '1.2.3', scope: 'user', enabled: true }]))
  process.exit(0)
}
// FAKE_ARGS=<file>: log every launch's arguments, so a test can check what the app started it with.
if (process.env.FAKE_ARGS) (await import('node:fs')).appendFileSync(process.env.FAKE_ARGS, JSON.stringify(args) + '\n')
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const settings = JSON.parse(readFileSync(flag('--settings'), 'utf8'))
// --fork-session: like real Claude, the resumed conversation continues under a new session id.
const forkedFrom = args.includes('--fork-session') ? flag('--resume') : null
let sessionId = forkedFrom ? `forked-${forkedFrom}` : (flag('--session-id') ?? flag('--resume'))
const { url, headers } = settings.hooks.PreToolUse[0].hooks[0]
const pause = Number(process.env.FAKE_DELAY_MS ?? 150)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// FAKE_TRANSCRIPT=1: also keep the saved conversation file real Claude keeps, so the chat view has something to read.
import { appendFileSync, mkdirSync as mk } from 'node:fs'
import { realpathSync } from 'node:fs'
const transcript = (line) => {
  if (!process.env.FAKE_TRANSCRIPT || !process.env.AW_CLAUDE_PROJECTS) return
  const dir = `${process.env.AW_CLAUDE_PROJECTS}/${realpathSync(process.cwd()).replace(/[^a-zA-Z0-9]/g, '-')}`
  mk(dir, { recursive: true })
  appendFileSync(`${dir}/${sessionId}.jsonl`, JSON.stringify({ isSidechain: false, timestamp: new Date().toISOString(), uuid: crypto.randomUUID(), sessionId, ...line }) + '\n')
}
const say = (text) => transcript({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })
// FAKE_SNAPSHOT=1: like real Claude, a new session saves the system prompt it started with; a resumed one keeps (and reuses) it.
if (process.env.FAKE_SNAPSHOT && flag('--session-id')) {
  transcript({ type: 'attachment', attachment: { type: 'prompt_snapshot', systemPrompt: JSON.stringify([flag('--append-system-prompt') ?? '']) } })
  say('an earlier answer')
}
// FAKE_SAY_FILE=<path>: the file's text arrives as one assistant message.
if (process.env.FAKE_SAY_FILE) say((await import('node:fs')).readFileSync(process.env.FAKE_SAY_FILE, 'utf8'))
// FAKE_USER_FILE=<path>: the file's text is already in the conversation as something the user said.
if (process.env.FAKE_USER_FILE) transcript({ type: 'user', message: { role: 'user', content: (await import('node:fs')).readFileSync(process.env.FAKE_USER_FILE, 'utf8') } })
// FAKE_LONG=n: a conversation that already has n messages in it.
for (let i = 0; i < Number(process.env.FAKE_LONG ?? 0); i++) say(`old message ${i}`)
const use = (name, input) => {
  const id = `toolu_${crypto.randomUUID().slice(0, 8)}`
  transcript({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } })
  return id
}
const done = (id, text, isError = false) => transcript({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } })
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
if (forkedFrom) console.log(`forked from ${forkedFrom}`)
console.log(`args: ${args.filter((a) => a.startsWith('--') && !['--settings', '--mcp-config', '--session-id', '--resume', '--name'].includes(a)).map((a) => `${a} ${args[args.indexOf(a) + 1]?.startsWith('--') ? '' : (args[args.indexOf(a) + 1] ?? '')}`).join(' ')}`)
// FAKE_DEV_PORT=n: behave like an agent that started a dev server on that port.
if (process.env.FAKE_DEV_PORT) console.log(`  ➜  Local:   http://localhost:${process.env.FAKE_DEV_PORT}/`)
await hook('SessionStart', { source: 'startup' })
// Like real Claude: a killed session still reports SessionEnd on its way out.
for (const sig of ['SIGHUP', 'SIGTERM']) process.on(sig, () => void hook('SessionEnd', { reason: 'other' }).finally(() => process.exit(0)))
// FAKE_COST=0.9 posts one statusline update the way Claude's statusline command would.
if (process.env.FAKE_COST) {
  const status = /(http\S+\/status)/.exec(settings.statusLine.command)[1]
  const res = await fetch(status, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, model: { display_name: 'Sonnet' }, context_window: { used_percentage: 42 }, rate_limits: { five_hour: { used_percentage: Number(process.env.FAKE_USED_5H ?? 38), resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 + 600 }, seven_day: { used_percentage: Number(process.env.FAKE_USED_WK ?? 21), resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 + 4 * 3600 } }, cost: { total_cost_usd: Number(process.env.FAKE_COST), total_lines_added: 12, total_lines_removed: 3 } })
  })
  console.log(`status bar: ${await res.text()}`)
}
// Echo typed or pasted input, so delivered messages are visible in this terminal.
process.stdin.setRawMode?.(true)
process.stdin.on('data', (d) => process.env.FAKE_PLAN || process.env.FAKE_TERMINAL_PROMPT || process.env.FAKE_ASKQ || process.env.FAKE_CHAT || process.stdout.write(String(d).replace(/\x1b\[20[01]~/g, '')))

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
// FAKE_CHAT=1: an idle agent that answers each prompt it is sent, keeping the saved conversation like real Claude does.
if (process.env.FAKE_CHAT) {
  await hook('Stop')
  let typed = ''
  const prompts = []
  const waiting = []
  let turn = false
  const MODES = ['default', 'acceptEdits', 'plan']
  const FOOT = { default: '⏸ manual mode on', acceptEdits: '⏵⏵ accept edits on (shift+tab to cycle)', plan: '⏸ plan mode on (shift+tab to cycle)' }
  const drawFoot = () => process.stdout.write(`\x1b[2J\x1b[H\r\n  fake claude (chat)\r\n\x1b[21;1H──────────\r\n❯ \r\n──────────\r\n  Agent World · Fake\r\n  ${FOOT[MODES[mode]]}\r\n`)
  let mode = 0
  drawFoot()
  let inMenu = false
  process.stdin.on('data', async (d) => {
    const raw = String(d)
    if (inMenu) return
    // Shift+Tab moves to the next permission mode. Like real Claude, only the footer says so until the next hook event.
    if (raw === '\x1b[Z') {
      mode = (mode + 1) % MODES.length
      drawFoot()
      return
    }
    // Ctrl+U clears the line being typed, as in Claude's own input box.
    if (raw.includes('\x15')) typed = ''
    typed += raw.replace(/\x1b\[20[01]~/g, '').replace(/\x15/g, '')
    if (!typed.includes('\r')) return
    const prompt = typed.split('\r')[0].trim()
    typed = ''
    if (!prompt) return
    // /btw: a side question in an overlay that closes with Esc.
    if (prompt.startsWith('/btw ')) {
      inMenu = true
      const draw = (body, foot) => process.stdout.write(`\x1b[2J\x1b[H\r\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\r\n    ${prompt}\r\n      ${body}\r\n    ${foot}\r\n`)
      draw('✻ Answering…', 'Esc to close')
      setTimeout(() => draw('It is 4.', '↑/↓ to scroll · c to copy · f to fork · Esc to close'), 700)
      const onKey = (d) => String(d) === '\x1b' && (process.stdin.off('data', onKey), (inMenu = false), drawFoot())
      return void process.stdin.on('data', onKey)
    }
    // /rewind: a list of the prompts so far, then Claude's confirmation menu (numbered), driven by keys.
    if (prompt === '/rewind') {
      inMenu = true
      let at = prompts.length
      const drawList = () => process.stdout.write(`\x1b[2J\x1b[H\r\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\r\n   Rewind\r\n   Restore the code and/or conversation to the point before…\r\n${prompts.map((p, i) => `   ${at === i ? '❯' : ' '} ${p}\r\n     No code changes\r\n`).join('')}   ${at === prompts.length ? '❯' : ' '} (current)\r\n   Enter to continue · Esc to cancel\r\n`)
      drawList()
      const picked = await new Promise((resolve) => {
        const onKey = (d) => {
          const k = String(d)
          if (k === '\x1b[A') at = Math.max(0, at - 1)
          else if (k === '\x1b[B') at = Math.min(prompts.length, at + 1)
          else if (k === '\x1b') return (process.stdin.off('data', onKey), resolve(null))
          else if (k === '\r') return (process.stdin.off('data', onKey), resolve(at))
          drawList()
        }
        process.stdin.on('data', onKey)
      })
      if (picked === null || picked >= prompts.length) return void ((inMenu = false), drawFoot())
      let choice = 0
      const drawConfirm = () => process.stdout.write(`\x1b[2J\x1b[H\r\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\r\n   Rewind\r\n   Confirm you want to restore to the point before you sent this message:\r\n   │ ${prompts[picked]}\r\n   The conversation will be forked.\r\n   ${choice === 0 ? '❯' : ' '} 1. Restore conversation\r\n   ${choice === 1 ? '❯' : ' '} 2. Summarize from here\r\n   ${choice === 2 ? '❯' : ' '} 3. Never mind\r\n`)
      drawConfirm()
      await new Promise((resolve) => {
        const onKey = (d) => {
          const k = String(d)
          if (k === '\x1b[A') choice = Math.max(0, choice - 1)
          else if (k === '\x1b[B') choice = Math.min(2, choice + 1)
          else if (k === '\r') return (process.stdin.off('data', onKey), resolve())
          drawConfirm()
        }
        process.stdin.on('data', onKey)
      })
      process.stdout.write(`\x1b[2J\x1b[H rewound to: ${prompts[picked]} (option ${choice + 1})\r\n`)
      const back = choice === 0 ? prompts[picked] : ''
      if (choice === 0) prompts.length = picked
      // Like the real one: the restored prompt goes back into the input box (after a non-breaking space).
      return void setTimeout(() => ((inMenu = false), drawFoot(), back && process.stdout.write(`\x1b[22;1H❯\u00a0${back}`)), 800)
    }
    prompts.push(prompt)
    // Shell mode: run nothing, just record it the way Claude does.
    if (prompt.startsWith('!')) {
      transcript({ type: 'user', message: { role: 'user', content: `<bash-input>${prompt.slice(1).trim()}</bash-input>` } })
      transcript({ type: 'user', message: { role: 'user', content: '<bash-stdout>On branch main\nnothing to commit</bash-stdout><bash-stderr></bash-stderr>' } })
      return
    }
    // FAKE_QUEUE=1: like the real one, something typed mid-turn waits, and is saved as a queued command (not a user line) when it is picked up.
    if (process.env.FAKE_QUEUE && turn) return void waiting.push(prompt)
    turn = true
    // Attached files arrive as @"path"; pictures are saved into the conversation as image blocks.
    const paths = [...prompt.matchAll(/@"([^"]+)"/g)].map((m) => m[1])
    const blocks = [{ type: 'text', text: prompt.replace(/@"[^"]+"\s*/g, '').trim() || 'see attached' }]
    for (const p of paths) if (/\.png$/i.test(p)) blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: readFileSync(p).toString('base64') } })
    transcript({ type: 'user', message: { role: 'user', content: paths.length ? blocks : prompt } })
    await hook('UserPromptSubmit', { prompt })
    // A working Claude shows a spinner line; it is gone when the turn ends.
    if (!process.env.FAKE_HANG) process.stdout.write('\x1b[19;1H✽ Working… (2s · ↓ 40 tokens)')
    // FAKE_HANG=1: the turn is interrupted (Esc) and Claude, like the real one, never sends a Stop hook.
    if (process.env.FAKE_HANG) {
      await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'x' } })
      return void transcript({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })
    }
    const bash = { command: 'ls src', description: 'List the source folder' }
    await hook('PreToolUse', { tool_name: 'Bash', tool_input: bash })
    const id = use('Bash', bash)
    await sleep(pause * 3)
    done(id, 'app.ts\nhealth.ts')
    await hook('PostToolUse', { tool_name: 'Bash', tool_input: bash })
    // FAKE_MCP=1: a tool lookup and two calls to an MCP server, as an agent using a browser would make.
    if (process.env.FAKE_MCP) {
      const look = use('ToolSearch', { query: 'select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot', max_results: 5 })
      done(look, '<functions><function>{"name":"mcp__playwright__browser_navigate"}</function></functions>')
      const nav = use('mcp__playwright__browser_navigate', { url: 'https://experts.snorkel-ai.com/home' })
      done(nav, "### Ran Playwright code\n```js\nawait page.goto('https://experts.snorkel-ai.com/home');\n```\n### Page\n- Page URL: https://experts.snorkel-ai.com/home\n- Page Title: Snorkel AI Experts Portal")
    }
    // FAKE_FILES=1: the agent makes a few files and names them in its reply, as a real one does.
    if (process.env.FAKE_FILES) {
      const fs = await import('node:fs')
      fs.mkdirSync(`${process.cwd()}/out`, { recursive: true })
      fs.writeFileSync(`${process.cwd()}/out/report.html`, '<html><body><h1 id="title">Quarterly report</h1><button id="go">Go</button></body></html>')
      fs.writeFileSync(`${process.cwd()}/notes.md`, '# Meeting notes\n\nWe agreed to **ship** on Friday.')
      fs.writeFileSync(`${process.cwd()}/deck.pptx`, 'not really a deck')
      fs.writeFileSync(`${process.cwd()}/tool.ts`, 'export const answer = 42\n')
      say(`I made ${process.cwd()}/out/report.html, \`notes.md\`, deck.pptx and tool.ts. See also https://example.com/docs/page.html and missing/nothing.md.`)
    }
    const edit = { file_path: `${process.cwd()}/src/health.ts`, old_string: 'export const ok = false', new_string: 'export const ok = true' }
    const eid = use('Edit', edit)
    done(eid, 'The file has been updated')
    say(`Done. I changed **health.ts** for "${prompt.replace(/@"[^"]+"\s*/g, '')}".\n\n\`\`\`ts\nexport const ok = true\n\`\`\`\n\n- one\n- two`)
    for (const q of waiting.splice(0)) {
      transcript({ type: 'attachment', attachment: { type: 'queued_command', prompt: q, origin: { kind: 'human' }, commandMode: 'prompt' } })
      say(`Picked up "${q}".`)
    }
    turn = false
    drawFoot()
    await hook('Stop')
  })
  await new Promise(() => {})
}
// FAKE_ASKQ=1: an AskUserQuestion with two questions, drawn as Claude draws it and driven by keys
// (Enter picks and moves on, Space toggles, Right turns the page, typing on the last row writes text).
if (process.env.FAKE_ASKQ) {
  const opt = (label) => ({ label, description: `about ${label}` })
  const qs = [
    { question: 'Favourite colour?', header: 'Color', options: [opt('Red'), opt('Green'), opt('Blue')], multiSelect: false },
    { question: 'Which pets?', header: 'Pets', options: [opt('Cat'), opt('Dog'), opt('Fish'), opt('Bird')], multiSelect: true }
  ]
  await hook('UserPromptSubmit', { prompt: 'ask me things' })
  await hook('PreToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'ask1', tool_input: { questions: qs } })
  await hook('PermissionRequest', { tool_name: 'AskUserQuestion', tool_input: { questions: qs } })
  let tab = 0, cursor = 1
  const picked = qs.map(() => new Set()), other = qs.map(() => null)
  const draw = () => {
    const bar = `←  ${qs.map((q, i) => `${i < tab ? '☒' : '☐'} ${q.header}`).join('  ')}  ✔ Submit  →\r\n`
    if (tab >= qs.length) return process.stdout.write(`\x1b[2J\x1b[H${bar}Review your answers\r\n\r\nReady to submit your answers?\r\n${cursor === 1 ? '❯' : ' '} 1. Submit answers\r\n  2. Cancel\r\n`)
    const q = qs[tab], n = q.options.length + 1
    const rows = q.options.map((o, i) => `${cursor === i + 1 ? '❯' : ' '} ${i + 1}. ${q.multiSelect ? (picked[tab].has(i + 1) ? '[✔] ' : '[ ] ') : ''}${o.label}\r\n     ${o.description}\r\n`).join('')
    process.stdout.write(`\x1b[2J\x1b[H${bar}${q.question}\r\n${rows}${cursor === n ? '❯' : ' '} ${n}. ${other[tab] ?? 'Type something.'}\r\n${'─'.repeat(30)}\r\n  ${n + 1}. Chat about this\r\nEnter to select · Tab/Arrow keys to navigate · Esc to cancel\r\n`)
  }
  const advance = () => {
    const q = qs[tab]
    if (!q.multiSelect && cursor <= q.options.length) picked[tab] = new Set([cursor])
    tab++
    cursor = 1
  }
  draw()
  await new Promise((resolve) => {
    const toggle = () => (picked[tab].has(cursor) ? picked[tab].delete(cursor) : picked[tab].add(cursor))
    const onKey = (d) => {
      const k = String(d), q = qs[tab]
      const rowCount = q ? q.options.length + 2 : 2
      if (k === '\x1b[B') cursor = Math.min(rowCount, cursor + 1)
      else if (k === '\x1b[A') cursor = Math.max(1, cursor - 1)
      else if (k === '\x1b[C') advance()
      else if (k === '\x1b[D') tab = Math.max(0, tab - 1)
      else if (k === ' ' && q?.multiSelect) toggle()
      else if (k === '\r') {
        if (!q) {
          if (cursor !== 1) return
          process.stdin.off('data', onKey)
          return resolve()
        }
        q.multiSelect ? toggle() : advance()
      } else if (q && !q.multiSelect && cursor === q.options.length + 1) other[tab] = (other[tab] ?? '') + k
      draw()
    }
    process.stdin.on('data', onKey)
  })
  const said = qs.map((q, i) => (other[i] ?? [...picked[i]].sort().map((n) => q.options[n - 1].label).join(','))).join(' | ')
  process.stdout.write(`\x1b[2J\x1b[Hanswers: ${said}\r\n`)
  await hook('PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'ask1', tool_input: { questions: qs } })
  await hook('Stop')
  await new Promise(() => {})
}
await hook('UserPromptSubmit', { prompt: 'add a health check' })
await sleep(pause)
await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'router' } })
await sleep(pause)
// FAKE_SUBS=n starts n subagents at once (default 1); FAKE_SUBS_HOLD=1 keeps them running for a screenshot.
const subIds = Array.from({ length: Number(process.env.FAKE_SUBS ?? 1) }, (_, i) => `sub-${i + 1}`)
for (const id of subIds) {
  await hook('SubagentStart', { agent_id: id, agent_type: 'Explore' })
  await hook('PreToolUse', { agent_id: id, tool_name: 'Read', tool_input: { file_path: `${process.cwd()}/README.md` } })
}
await sleep(pause)
if (process.env.FAKE_SUBS_HOLD) await new Promise(() => {})
for (const id of subIds) await hook('SubagentStop', { agent_id: id })
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
  await sleep(6000)
  await hook('PostToolUse', { tool_name: 'Bash', tool_use_id: 'tu-1' })
}
const answer = process.env.FAKE_TERMINAL_PROMPT ? null : await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } })
console.log(`decision: ${answer?.hookSpecificOutput?.decision?.behavior ?? 'ask-in-terminal'}`)
// FAKE_OWN_DIALOG=1: Claude insists on its own confirmation even after the hook allowed it (as for commands with $(...)).
if (process.env.FAKE_OWN_DIALOG) {
  let at = 0
  const draw = () => process.stdout.write(`\x1b[2J\x1b[H\r\n──────────────────────────────────────────────\r\n Bash command\r\n   echo $(date +%Y)\r\n Contains command_substitution\r\n Do you want to proceed?\r\n ${at === 0 ? '❯' : ' '} 1. Yes\r\n ${at === 1 ? '❯' : ' '} 2. No\r\n Esc to cancel · Tab to amend\r\n`)
  draw()
  await new Promise((resolve) => {
    const onKey = (d) => {
      const k = String(d)
      if (k === '\x1b[B') at = 1
      else if (k === '\x1b[A') at = 0
      else if (k === '\r') {
        process.stdin.off('data', onKey)
        process.stdout.write(`\x1b[2J\x1b[H chose option ${at + 1}\r\n`)
        return resolve()
      }
      draw()
    }
    process.stdin.on('data', onKey)
  })
}
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
