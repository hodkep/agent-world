#!/usr/bin/env node
// Stand-in for the claude CLI: reads the hook settings it is launched with and replays a
// scripted session through them, so the app can be exercised without spending tokens.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
// Background commands under the agent, like a dev server it started.
// FAKE_CHILD=n starts n of them (sleep 300, sleep 301, …).
for (let i = 0; i < Number(process.env.FAKE_CHILD ?? 0); i++) spawn('sh', ['-c', `sleep ${300 + i}; true`], { stdio: 'ignore' }).unref()
// Read-only subcommands the app runs to inspect the setup.
// FAKE_CALLS=<file>: log management calls so a test can check what the app asked for.
if (process.env.FAKE_CALLS && ['add', 'remove', 'enable', 'disable', 'uninstall'].includes(args[1])) (await import('node:fs')).appendFileSync(process.env.FAKE_CALLS, args.join(' ') + '\n')
if (args[0] === '--version') {
  console.log('2.1.289 (Claude Code)')
  process.exit(0)
}
// What `claude auth status` prints: signed in, so the app does not hold hiring back for a sign-in.
// FAKE_SIGNED_OUT=1 says nobody is signed in; FAKE_CONFIG_DIR is the folder it names as its configuration (the app reads its .claude.json, read only).
// An account the app made (in its own home) keeps its sign-in in a file (below), so only the computer's own login is answered here.
if (args[0] === 'auth' && args[1] === 'status' && (process.env.FAKE_SIGNED_OUT || !(process.env.AW_HOME && process.env.CLAUDE_CONFIG_DIR?.startsWith(`${process.env.AW_HOME}/accounts/`)))) {
  // FAKE_OWN_SIGNED_OUT=1: only the computer's own login is signed out; accounts keep their sign-in in a file (below).
  const out = process.env.FAKE_SIGNED_OUT || process.env.FAKE_OWN_SIGNED_OUT ? { loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' } : { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'dev@example.com' }
  console.log(JSON.stringify({ ...out, configDirectory: process.env.FAKE_CONFIG_DIR ?? '/nonexistent/fake-claude-config' }, null, 2))
  process.exit(out.loggedIn ? 0 : 1)
}
if (args[0] === 'mcp') {
  console.log('Checking MCP server health…\n\nfake-docs: https://docs.example/mcp - ✔ Connected\nfake-db: npx fake-db - ✗ Failed to connect\nplugin:productivity:asana: https://mcp.asana.com/v2/mcp (HTTP) - ✘ Failed to connect — Incompatible auth server: does not support dynamic client registration')
  process.exit(0)
}
if (args[0] === 'plugin') {
  console.log(JSON.stringify([{ id: 'fake-plugin@market', version: '1.2.3', scope: 'user', enabled: true }]))
  process.exit(0)
}
// The audit: one question on stdin, answered as claude's JSON output. FAKE_AUDIT is the reply text, FAKE_AUDIT_FAIL makes it an error,
// FAKE_AUDIT_LOG=<file> keeps every question so a test can see what the model was shown, FAKE_AUDIT_DELAY_MS holds the answer back, as a model takes its time.
if (args[0] === '-p' && args.includes('--output-format')) {
  let question = ''
  for await (const chunk of process.stdin) question += chunk
  if (process.env.FAKE_AUDIT_LOG) (await import('node:fs')).appendFileSync(process.env.FAKE_AUDIT_LOG, JSON.stringify(question) + '\n')
  const fail = !!process.env.FAKE_AUDIT_FAIL
  if (process.env.FAKE_AUDIT_DELAY_MS) await new Promise((r) => setTimeout(r, Number(process.env.FAKE_AUDIT_DELAY_MS)))
  console.log(JSON.stringify({ type: 'result', is_error: fail, result: fail ? process.env.FAKE_AUDIT_FAIL : (process.env.FAKE_AUDIT ?? '{"findings":[]}'), total_cost_usd: 0.004, modelUsage: { 'claude-haiku-5-5': { costUSD: 0.004 } } }))
  process.exit(fail ? 1 : 0)
}
// FAKE_ENV_FILE: log the office's address and token and git's configuration this session was started with, so a test can run git as the agent would.
if (process.env.FAKE_ENV_FILE) (await import('node:fs')).appendFileSync(process.env.FAKE_ENV_FILE, JSON.stringify({ url: process.env.AW_MCP_URL ?? null, token: process.env.AW_AGENT_TOKEN ?? null, git: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^GIT_CONFIG_|^AW_ORIG_HOOKS$/.test(k))) }) + '\n')
// `claude -p "/usage"`: the app asks for limits this way; it is not a launch. FAKE_USAGE is what it prints.
if (args[0] === '-p') {
  console.log(process.env.FAKE_USAGE ?? '')
  process.exit(0)
}
// `claude auth status|login`: who is signed in is a file in the config folder, so each account keeps its own sign-in.
if (args[0] === 'auth') {
  const { existsSync, readFileSync: read, writeFileSync, mkdirSync } = await import('node:fs')
  const { join, basename } = await import('node:path')
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? '', '.claude')
  const file = join(dir, '.fake-login')
  if (args[1] === 'login') {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, `${basename(dir)}@example.com`)
    console.log(`Logged in as ${basename(dir)}@example.com`)
  } else console.log(JSON.stringify(existsSync(file) ? { loggedIn: true, email: read(file, 'utf8') } : { loggedIn: false }))
  process.exit(0)
}
// FAKE_ENV=<file>: log the config folder each launch was given.
if (process.env.FAKE_ENV) (await import('node:fs')).appendFileSync(process.env.FAKE_ENV, `${process.env.CLAUDE_CONFIG_DIR ?? '-'}\n`)
// FAKE_ARGS=<file>: log every launch's arguments, so a test can check what the app started it with.
if (process.env.FAKE_ARGS) (await import('node:fs')).appendFileSync(process.env.FAKE_ARGS, JSON.stringify(args) + '\n')
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const settings = JSON.parse(readFileSync(flag('--settings'), 'utf8'))
// --fork-session: like real Claude, the resumed conversation continues under a new session id.
const forkedFrom = args.includes('--fork-session') ? flag('--resume') : null
let sessionId = forkedFrom ? `forked-${forkedFrom}` : (flag('--session-id') ?? flag('--resume'))
const { url, headers } = settings.hooks.PreToolUse[0].hooks[0]
const pause = Number(process.env.FAKE_DELAY_MS ?? 150)
// --remote-control: like real Claude, the screen says where the session can be continued (FAKE_REMOTE_REFUSE=<text> says it cannot instead).
let remoteLine = !args.includes('--remote-control') ? '' : process.env.FAKE_REMOTE_REFUSE ? `  ${process.env.FAKE_REMOTE_REFUSE}\r\n` : `  /remote-control is active · Code in CLI or at https://claude.ai/code/session_fake${flag('--remote-control')}\r\n`
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
// FAKE_SESSION_LOCK=1: like real Claude, --session-id for a session that already has its file is refused (only --resume can open it).
if (process.env.FAKE_SESSION_LOCK && flag('--session-id') && process.env.AW_CLAUDE_PROJECTS) {
  const f = `${process.env.AW_CLAUDE_PROJECTS}/${realpathSync(process.cwd()).replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`
  if ((await import('node:fs')).existsSync(f)) {
    console.error(`Error: Session ID ${sessionId} is already in use.`)
    process.exit(1)
  }
}
// FAKE_SNAPSHOT=1: like real Claude, a new session saves the system prompt it started with; a resumed one keeps (and reuses) it.
if (process.env.FAKE_SNAPSHOT && flag('--session-id')) {
  transcript({ type: 'attachment', attachment: { type: 'prompt_snapshot', systemPrompt: JSON.stringify([flag('--append-system-prompt') ?? '']) } })
  say('an earlier answer')
}
// FAKE_DELEGATE=n: the conversation has n Agent calls, and Claude's own files for those subagents fill in over time
// (a trail of calls, then an answer; step length FAKE_DELEGATE_MS, default 600). FAKE_DELEGATE_HOLD=1 leaves the last one working.
if (process.env.FAKE_DELEGATE && process.env.AW_CLAUDE_PROJECTS && process.env.FAKE_TRANSCRIPT) {
  const n = Number(process.env.FAKE_DELEGATE)
  const step = Number(process.env.FAKE_DELEGATE_MS ?? 600)
  const base = `${process.env.AW_CLAUDE_PROJECTS}/${realpathSync(process.cwd()).replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}/subagents`
  const { mkdirSync: mkd, writeFileSync: wf } = await import('node:fs')
  mkd(base, { recursive: true })
  const stamp = () => new Date().toISOString()
  for (let i = 1; i <= n; i++) {
    transcript({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `toolu_fake_${i}`, name: 'Agent', input: { description: `Look into part ${i}`, subagent_type: i % 2 ? 'Explore' : 'Plan', prompt: 'go' } }] } })
  }
  ;(async () => {
    await Promise.all(Array.from({ length: n }, async (_, k) => {
      const i = k + 1
      const id = `fake${i}`
      const file = `${base}/agent-${id}.jsonl`
      wf(`${base}/agent-${id}.meta.json`, JSON.stringify({ agentType: i % 2 ? 'Explore' : 'Plan', description: `Look into part ${i}`, toolUseId: `toolu_fake_${i}`, spawnDepth: 1, requestShape: 'background' }))
      await sleep(300)
      // The hooks Claude runs: a subagent starts, and stops when it answers (not when it is stopped, which is the point of FAKE_DELEGATE_STOP).
      await hook('SubagentStart', { agent_id: id, agent_type: i % 2 ? 'Explore' : 'Plan' })
      const add = (o) => appendFileSync(file, JSON.stringify({ isSidechain: true, agentId: id, timestamp: stamp(), uuid: crypto.randomUUID(), ...o }) + '\n')
      add({ type: 'user', message: { role: 'user', content: 'go' } })
      await sleep(step * i)
      // FAKE_DELEGATE_NEST=1: the first one starts a subagent of its own, which has its own files.
      const steps = [['Grep', { pattern: `part${i}` }], ['Read', { file_path: `/repo/src/part${i}.ts` }], ['Glob', { pattern: '**/*.ts' }]]
      if (process.env.FAKE_DELEGATE_NEST && i === 1) {
        steps.splice(1, 0, ['Agent', { description: 'Nested helper' }])
        wf(`${base}/agent-fakekid.meta.json`, JSON.stringify({ agentType: 'Explore', description: 'Nested helper', toolUseId: 'toolu_kid', spawnDepth: 2, requestShape: 'foreground' }))
        appendFileSync(`${base}/agent-fakekid.jsonl`, JSON.stringify({ isSidechain: true, agentId: 'fakekid', timestamp: stamp(), uuid: crypto.randomUUID(), type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'kid1', name: 'Read', input: { file_path: '/repo/kid.ts' } }] } }) + '\n')
      }
      for (const [name, input] of steps) {
        add({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: name === 'Agent' ? 'toolu_kid' : `t${i}${name}`, name, input }] } })
        await sleep(step)
      }
      // FAKE_DELEGATE_STOP=k: subagent k is stopped, which Claude records as an interruption at the end of its file.
      if (Number(process.env.FAKE_DELEGATE_STOP) === i) return void add({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })
      if (process.env.FAKE_DELEGATE_HOLD && i === n) return
      if (process.env.FAKE_DELEGATE_HANDBACK) {
        // Like a subagent run in the background: it reports by a hand-back call, and the harness types the report and a notice into the conversation.
        const report = `Part ${i} is fine.\nChecked three files.`
        add({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `hb${i}`, name: 'SubagentHandback', input: { message: report } }] } })
        transcript({ type: 'user', isMeta: true, message: { role: 'user', content: `Another Claude session sent a message:\n<agent-message from="${id}">\n[Subagent hand-back] The text below is the final report of a subagent. The report follows:\n${report.split('\n').map((l) => `  ${l}`).join('\n')}\n</agent-message>\n\nThat other session is an agent.` } })
        transcript({ type: 'user', message: { role: 'user', content: `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n<summary>Agent "Look into part ${i}" finished</summary>\n</task-notification>` } })
        await hook('SubagentStop', { agent_id: id })
        return
      }
      add({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: `Part ${i} is fine.` }] } })
      await hook('SubagentStop', { agent_id: id })
      // FAKE_DELEGATE_RESUME=ms: that long after it finished, the main agent sends the first subagent a message. Claude fires no
      // "started" hook for the resume: the message only shows as a call in the main conversation and as new lines in the subagent's file.
      if (process.env.FAKE_DELEGATE_RESUME && i === 1) {
        await sleep(Number(process.env.FAKE_DELEGATE_RESUME))
        const input = { to: id, summary: 'Fix the dialog', message: 'The user says the dialog is not well formatted. Fix the whole dialog and check it.' }
        await hook('PreToolUse', { tool_name: 'SendMessage', tool_input: input })
        const call = use('SendMessage', input)
        done(call, JSON.stringify({ success: true, message: `Resuming agent ${id.slice(0, 7)}`, resumedAgentId: id }))
        add({ type: 'user', message: { role: 'user', content: `The coordinator sent a message while you were working:\n${input.message}` } })
        for (const k of [1, 2, 3, 4, 5, 6]) {
          await sleep(1000)
          add({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `resume${k}`, name: 'Read', input: { file_path: `/repo/dialog${k}.tsx` } }] } })
        }
      }
    }))
  })()
}
// FAKE_SAY_FILE=<path>: the file's text arrives as one assistant message.
if (process.env.FAKE_SAY_FILE) say((await import('node:fs')).readFileSync(process.env.FAKE_SAY_FILE, 'utf8'))
// FAKE_USER_FILE=<path>: the file's text is already in the conversation as something the user said.
if (process.env.FAKE_USER_FILE) transcript({ type: 'user', message: { role: 'user', content: (await import('node:fs')).readFileSync(process.env.FAKE_USER_FILE, 'utf8') } })
// FAKE_EVENTS=1: the system events Claude saves in a conversation: a Monitor firing three times (with the agent speaking in
// between), a background command that failed, an interrupt and a slash command's output.
if (process.env.FAKE_EVENTS) {
  const notice = (body) => transcript({ type: 'user', message: { role: 'user', content: `<task-notification>\n${body}\n</task-notification>` } })
  const monitor = (event) => notice(`<task-id>bm1</task-id>\n<summary>Monitor event: "Wait for backend 8081"</summary>\n<event>${event}</event>\nIf this event is something the user would act on now, send a PushNotification. Routine or benign output doesn't need one.`)
  say('The backend is still starting up, so I am waiting on it.')
  monitor('curl: (7) Failed to connect to localhost port 8081')
  say('Still waiting.')
  monitor('waiting… (3 tries)')
  monitor('HTTP/1.1 200 OK — backend up on :8081')
  notice('<task-id>bf1</task-id>\n<status>failed</status>\n<summary>Background command "npm run e2e" failed with exit code 1</summary>')
  transcript({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })
  transcript({ type: 'user', message: { role: 'user', content: '<local-command-stdout>Set model to claude-sonnet-5-5</local-command-stdout>' } })
  say('Back to it.')
}
// FAKE_HOOK_NOTE=1: what hooks told the agent, as Claude saves it: a session-start brief, then a Stop hook's findings.
if (process.env.FAKE_HOOK_NOTE) {
  const hook = (hookName, content) => transcript({ type: 'attachment', attachment: { type: 'hook_additional_context', hookName, hookEvent: hookName.split(':')[0], content: [content] } })
  hook('SessionStart', 'CAVEMAN MODE ACTIVE: talk short.')
  hook('Stop', '[impeccable@1] Design hook findings requiring review in src/renderer/styles.css (1 issue(s)):\n- L962 [side-tab] Side-tab accent border. Thick colored border on one side of a card.')
  // Like a real agent, it looks into the findings with a tool call before it answers.
  transcript({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_hooknote', name: 'Bash', input: { command: 'git blame src/renderer/styles.css' } }] } })
  transcript({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_hooknote', content: 'e25bb26c (Ada) .quote-cards li', is_error: false }] } })
  say('The flagged line is the quote cards rule.')
  // A hook note with no reply after it (a tool call or nothing comes next) has to show up on its own.
  hook('PostToolUse:Edit', '[lint] 2 problems found in a.css')
}
// FAKE_LONG=n: a conversation that already has n messages in it.
for (let i = 0; i < Number(process.env.FAKE_LONG ?? 0); i++) say(`old message ${i}`)
const use = (name, input) => {
  const id = `toolu_${crypto.randomUUID().slice(0, 8)}`
  transcript({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } })
  return id
}
const done = (id, text, isError = false) => transcript({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } })
// FAKE_WATCH=1: a monitor that fired twice and then ended, a wake-up in 25 minutes, two cron jobs and the cancelling of one.
if (process.env.FAKE_WATCH) {
  const notice = (body) => transcript({ type: 'user', message: { role: 'user', content: `<task-notification>\n${body}\n</task-notification>` } })
  const m = use('Monitor', { command: 'until curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/v1/public/tb-basket/quote | grep -q 200; do sleep 3; done; echo up', description: 'Wait for the restarted backend to come up', timeout_ms: 240000 })
  done(m, 'Monitor started (task bnfx5vv1z, expires in 4m unless the source ends first; you get one notice at expiry). You will be notified on each event. Keep working — do not poll or sleep.')
  notice('<task-id>bnfx5vv1z</task-id>\n<summary>Monitor event: "Wait for the restarted backend to come up"</summary>\n<event>curl: (7) Failed to connect to localhost port 8081</event>')
  notice('<task-id>bnfx5vv1z</task-id>\n<summary>Monitor event: "Wait for the restarted backend to come up"</summary>\n<event>HTTP/1.1 200 OK — backend up on :8081</event>')
  notice('<task-id>bnfx5vv1z</task-id>\n<status>completed</status>\n<summary>Monitor "Wait for the restarted backend to come up" ended</summary>')
  // A second monitor that is still watching, and has fired once.
  done(use('Monitor', { command: 'tail -f /tmp/build.log | grep --line-buffered ERROR', description: 'Watch the build log for errors', timeout_ms: 3600000 }), 'Monitor started (task wb77q1, timeout 3600000ms). You will be notified on each event.')
  notice('<task-id>wb77q1</task-id>\n<summary>Monitor event: "Watch the build log for errors"</summary>\n<event>ERROR in src/App.tsx(12): missing semicolon</event>')
  const w = use('ScheduleWakeup', { delaySeconds: 1500, reason: 'Check whether the CI run for the photo block has finished', prompt: '/loop check CI for aw/csr-1' })
  done(w, JSON.stringify({ scheduledFor: Date.now() + 1_500_000, sentinel: false }))
  const c = use('CronCreate', { cron: '0 9 * * 1-5', prompt: 'Summarise what changed on main overnight', recurring: true })
  done(c, 'Scheduled recurring job. Job ID: ab12cd34')
  const d = use('CronCreate', { cron: '7 * * * *', prompt: 'Hourly check of the build' })
  done(d, 'Scheduled recurring job. Job ID: ee99ff00')
  done(use('CronDelete', { id: 'ee99ff00' }), 'Deleted job ee99ff00')
}
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
// Like real Claude: a killed session still reports SessionEnd on its way out.
for (const sig of ['SIGHUP', 'SIGTERM']) process.on(sig, () => void hook('SessionEnd', { reason: 'other' }).finally(() => process.exit(0)))
// Saying it has started: SessionStart, then its first status line. A chat agent says so once its screen is up (at the end of its setup below), as Claude does:
// the app takes SessionStart and Stop for "ready for input", so earlier than that a message sent to it would be lost.
const announceStart = async () => {
  await hook('SessionStart', { source: 'startup' })
  // FAKE_COST=0.9 posts one statusline update the way Claude's statusline command would.
  if (process.env.FAKE_COST) {
    const status = /(http\S+\/status)/.exec(settings.statusLine.command)[1]
    const res = await fetch(status, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, model: { display_name: 'Sonnet' }, context_window: { used_percentage: 42, total_input_tokens: Number(process.env.FAKE_TOKENS_IN ?? 0), total_output_tokens: Number(process.env.FAKE_TOKENS_OUT ?? 0) }, rate_limits: { five_hour: { used_percentage: Number(process.env[`FAKE_USED_5H_${(process.env.CLAUDE_CONFIG_DIR ?? '').split('/').pop().toUpperCase()}`] ?? process.env.FAKE_USED_5H ?? 38), resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 + 600 }, seven_day: { used_percentage: Number(process.env.FAKE_USED_WK ?? 21), resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 + 4 * 3600 } }, cost: { total_cost_usd: Number(process.env.FAKE_COST), total_lines_added: 12, total_lines_removed: 3 } })
    })
    console.log(`status bar: ${await res.text()}`)
  }
}
if (!process.env.FAKE_CHAT) await announceStart()
// Echo typed or pasted input, so delivered messages are visible in this terminal.
process.stdin.setRawMode?.(true)
process.stdin.on('data', (d) => process.env.FAKE_PLAN || process.env.FAKE_TERMINAL_PROMPT || process.env.FAKE_ASKQ || process.env.FAKE_CHAT || process.stdout.write(String(d).replace(/\x1b\[20[01]~/g, '')))

// FAKE_PROMPT_HOOK=1: a line typed to the agent is reported to the office as UserPromptSubmit from this process, as Claude does, and what the office answers is kept in
// FAKE_CONTEXT_LOG. A line "forge <words>" also makes a command the agent runs (a child process) post <words> as a prompt to the same hook with the same token, as a
// misbehaving agent could.
const FORGER = "const [url, headers, body] = process.argv.slice(1); fetch(url, { method: 'POST', headers: { ...JSON.parse(headers), 'content-type': 'application/json' }, body }).then(async (r) => console.log(r.status + ' ' + (await r.text()))).catch((e) => console.log('error ' + e.message))"
if (process.env.FAKE_PROMPT_HOOK) {
  const keep = (o) => process.env.FAKE_CONTEXT_LOG && appendFileSync(process.env.FAKE_CONTEXT_LOG, JSON.stringify(o) + '\n')
  let line = ''
  process.stdin.on('data', async (d) => {
    for (const ch of String(d).replace(/\x1b\[20[01]~/g, '')) {
      if (ch !== '\r') {
        line += ch
        continue
      }
      const prompt = line.trim()
      line = ''
      if (!prompt) continue
      const said = await hook('UserPromptSubmit', { prompt })
      keep({ prompt, context: said?.hookSpecificOutput?.additionalContext ?? '' })
      const forged = /^forge (.+)$/.exec(prompt)?.[1]
      if (forged) {
        const body = JSON.stringify({ session_id: sessionId, cwd: process.cwd(), hook_event_name: 'UserPromptSubmit', prompt: forged })
        const r = spawnSync(process.execPath, ['-e', FORGER, url, JSON.stringify(headers), body], { encoding: 'utf8' })
        keep({ forged, answer: r.stdout.trim() })
      }
    }
  })
}

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
// FAKE_SPAWN=ada:claude:task makes the agent named ada start a subagent through the office and print what came back.
async function spawnViaOffice(provider, task) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const server = JSON.parse(readFileSync(flag('--mcp-config'), 'utf8')).mcpServers['agent-world']
  const client = new Client({ name: 'fake-claude', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers } }))
  // The conversation shows the call the way Claude saves it, and what came back.
  const call = use('mcp__agent-world__spawn_subagent', { provider, task })
  const r = await client.callTool({ name: 'spawn_subagent', arguments: { provider, task } }, undefined, { timeout: 120000 })
  done(call, r.content[0].text)
  console.log(`spawn_subagent → ${r.content[0].text}`)
  await client.close()
}
const [spawnFrom, spawnProvider, ...spawnTask] = (process.env.FAKE_SPAWN ?? '').split(':')
const [sendFrom, sendTo, ...sendText] = (process.env.FAKE_SEND ?? '').split(':')
const myName = args.includes('--name') ? flag('--name') : null

// FAKE_ECHO_LIST=1: the screen of a Claude whose conversation has your own numbered message in it, shown after the ❯ prompt marker,
// with its reply and an empty input box below. It is not a menu and nothing is waiting.
if (process.env.FAKE_ECHO_LIST) {
  const rule = '─'.repeat(60)
  process.stdout.write(`\x1b[2J\x1b[H\r\n✱ Brewed for 34s · done 3:20 PM\r\n\r\n❯ 1. I mean sub-agent only\r\n  2. I want a view where all subagents running per main\r\n  agent are shown with same visualization as we show\r\n  3. I would like you to look into claude code's\r\n  subagent management\r\n\r\n● I've handed the research to a documentation agent.\r\n\r\n✱ Waiting for 1 background agent to finish\r\n\r\n${rule}\r\n❯ \r\n${rule}\r\n`)
  await new Promise(() => {})
}
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
  // FAKE_START_MS=n: a slow start. Nothing is drawn and nothing read until then, as with Claude loading on a busy machine.
  await sleep(Number(process.env.FAKE_START_MS || 0))
  // The chat agent has no script to reach the line further down, so it starts its subagent once its screen is up.
  // FAKE_OPEN=<command>: the agent runs that shell command once its screen is up (the hook the app sees is what matters here).
  if (process.env.FAKE_OPEN) setTimeout(() => void hook('PreToolUse', { tool_name: 'Bash', tool_input: { command: process.env.FAKE_OPEN } }), 2500)
  if (myName && myName === spawnFrom) setTimeout(() => void spawnViaOffice(spawnProvider, spawnTask.join(':')).catch((e) => console.log(`spawn failed: ${e.message}`)), 2500)
  let typed = ''
  const prompts = []
  const waiting = []
  let turn = false
  const MODES = ['default', 'acceptEdits', 'plan']
  const FOOT = { default: '⏸ manual mode on', acceptEdits: '⏵⏵ accept edits on (shift+tab to cycle)', plan: '⏸ plan mode on (shift+tab to cycle)' }
  // FAKE_REMOTE_ONCE=1: the remote line is on the screen once, as at the real start; later the conversation fills it.
  const drawFoot = () => (process.env.FAKE_REMOTE_ONCE && setTimeout(() => (remoteLine = ''), 0), process.stdout.write(`\x1b[2J\x1b[H\r\n  fake claude (chat)\r\n${remoteLine}\x1b[21;1H──────────\r\n❯ \r\n──────────\r\n  Agent World · Fake\r\n  ${FOOT[MODES[mode]]}\r\n`))
  let mode = 0
  let inMenu = false
  if (process.env.FAKE_ONBOARDING) {
    // FAKE_ONBOARDING=1: the first questions of a new Claude Code, as 2.1.302 drew them: the text style list (no numbers), how to log in, the page that waits for a code.
    inMenu = true
    const draw = (t) => process.stdout.write(`\x1b[2J\x1b[H${t.replace(/\n/g, '\r\n')}`)
    const THEMES = ['Auto (match terminal)', 'Dark mode', 'Light mode', 'Dark mode (colorblind-friendly)']
    const LOGINS = ['Claude account with subscription · Pro, Max, Team, or Enterprise', 'Anthropic Console account · API usage billing', '3rd-party platform · Amazon Bedrock, Microsoft Foundry, Google Vertex AI']
    let at = 1
    let screen = 'theme'
    const paint = () => {
      if (screen === 'theme') draw(`Welcome to Claude Code v2.1.302\n..........................\n\n Let's get started.\n\n Choose the text style that looks best with your terminal\n To change this later, run /theme\n\n${THEMES.map((t, i) => `${i === at ? ' ❯' : '  '} ${t}`).join('\n')}\n\n ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌\n  Syntax theme: Monokai Extended (ctrl+t to disable)`)
      else if (screen === 'login') draw(`Welcome to Claude Code v2.1.302\n..........................\n\n Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.\n\n Select login method:\n\n${LOGINS.map((t, i) => `${i === at ? ' ❯' : '  '} ${i + 1}. ${t}`).join('\n')}`)
      else draw(`Welcome to Claude Code v2.1.302\n..........................\n\n Browser didn't open? Use the url below to sign in (c to copy)\n\nhttps://claude.com/cai/oauth/authorize?code=true&client_id=fake\n\n\n Paste code here if prompted >`)
    }
    paint()
    process.stdin.on('data', (d) => {
      const k = String(d)
      const n = screen === 'theme' ? THEMES.length : LOGINS.length
      if (screen === 'oauth') return
      if (k === '\x1b[B') (at = Math.min(n - 1, at + 1), paint())
      else if (k === '\x1b[A') (at = Math.max(0, at - 1), paint())
      else if (k === '\r') ((screen = screen === 'theme' ? 'login' : 'oauth'), (at = 0), paint())
      // Esc does nothing on these screens, as on the real ones.
    })
  } else if (process.env.FAKE_DIALOG) {
    // FAKE_DIALOG=1: a first-run notice with no numbered options, like the Chrome one a new account shows; Enter confirms it, Esc cancels it.
    inMenu = true
    process.stdout.write(`\x1b[2J\x1b[H${'─'.repeat(40)}\r\n  Claude in Chrome\r\n\r\n  Works with the Chrome extension to control your browser.\r\n\r\n  Enter to confirm · Esc to cancel\r\n`)
    const onKey = (d) => ['\r', '\x1b'].includes(String(d)) && (process.stdin.off('data', onKey), (inMenu = false), drawFoot())
    process.stdin.on('data', onKey)
  } else drawFoot()
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
    const [first, ...rest] = typed.split('\r')
    const prompt = first.trim()
    // What came after that Enter (a second message sent straight after the first, read together with it) waits for its own turn, as in Claude's input box.
    typed = rest.join('\r')
    if (typed.includes('\r')) setImmediate(() => process.stdin.emit('data', ''))
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
    if (prompt === '/rewind' && process.env.FAKE_REWIND_EMPTY) {
      // FAKE_REWIND_EMPTY=1: like real Claude with no earlier prompt, the box says so and waits for Esc.
      inMenu = true
      process.stdout.write('\x1b[2J\x1b[H\r\n▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔\r\n Rewind\r\n\r\n Nothing to rewind to yet.\r\n\r\n Esc to cancel\r\n')
      const onKey = (d) => String(d) === '\x1b' && (process.stdin.off('data', onKey), (inMenu = false), drawFoot())
      return void process.stdin.on('data', onKey)
    }
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
    // FAKE_SUBMIT_LAG_MS: the report that the turn began comes late, as it sometimes does.
    if (process.env.FAKE_SUBMIT_LAG_MS) await sleep(Number(process.env.FAKE_SUBMIT_LAG_MS))
    await hook('UserPromptSubmit', { prompt })
    // A working Claude shows a spinner line; it is gone when the turn ends.
    if (!process.env.FAKE_HANG) process.stdout.write('\x1b[19;1H✽ Working… (2s · ↓ 40 tokens)')
    // FAKE_BUSY=1: the turn shows its spinner and carries on until Esc, which ends it as Claude does: an interruption note and no Stop hook.
    if (process.env.FAKE_BUSY) {
      // The spinner is drawn again now and then, so a redraw of the screen (the terminal being resized) does not make the turn look over.
      const spin = setInterval(() => process.stdout.write('\x1b[19;1H✽ Working… (2s · ↓ 40 tokens)'), 400)
      await new Promise((resolve) => {
        const onKey = (d) => String(d) === '\x1b' && (process.stdin.off('data', onKey), clearInterval(spin), resolve())
        process.stdin.on('data', onKey)
      })
      turn = false
      process.stdout.write('\x1b[19;1H\x1b[2K')
      return void transcript({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })
    }
    // FAKE_RESTORE_ON_ESC=1: like the real one, an Esc before anything was produced takes the prompt back into the input box.
    if (process.env.FAKE_RESTORE_ON_ESC) {
      await new Promise((resolve) => {
        const onKey = (d) => String(d) === '\x1b' && (process.stdin.off('data', onKey), resolve())
        process.stdin.on('data', onKey)
      })
      turn = false
      return void process.stdout.write(`\x1b[19;1H\x1b[2K\x1b[22;1H❯\u00a0${prompt}`)
    }
    // FAKE_WORK_UNTIL_ESC=1: a turn that really goes on, spinner and all, until an Esc reaches it (an Esc the app keeps for itself, to close a menu, never does).
    if (process.env.FAKE_WORK_UNTIL_ESC) {
      await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'x' } })
      await new Promise((resolve) => {
        const onKey = (d) => String(d) === '\x1b' && (process.stdin.off('data', onKey), resolve())
        process.stdin.on('data', onKey)
      })
      turn = false
      process.stdout.write('\x1b[19;1H\x1b[2K')
      return void transcript({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } })
    }
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
    // FAKE_LIBRARY=1: the office's library calls and a note, as an agent following its rulebook makes them.
    if (process.env.FAKE_LIBRARY) {
      const t = 'mcp__agent-world__'
      const a = use(`${t}library_skip`, { id: 'tdd', reason: 'no code is written here' })
      done(a, 'Noted: tdd does not apply.')
      const b = use(`${t}library_get`, { id: 'house-research' })
      done(b, '# house-research\nEnd every note with the exact line HOUSE-CHECKED-ZX9.\nThat is all.')
      const c = use(`${t}recall`, { query: 'default ports' })
      done(c, 'Nothing saved about that.')
    }
    // FAKE_TODO=1: calls to the todo tools, as an agent keeping the board would make them, and a reply that names a task.
    if (process.env.FAKE_TODO) {
      const t = 'mcp__agent-world__'
      const a = use(`${t}todo_add`, { title: 'Write the docs page', list: 'Manual setup', needs_you: true })
      done(a, 'Added todo#14 to Manual setup.')
      const l = use(`${t}todo_list`, {})
      done(l, 'todo#14 [Manual setup] Write the docs page — open, needs you; created by ada (claude) just now, updated just now\ntodo#9 [Tools] Slow — thing — doing, bob (agy) is on it; created by you 2 h ago, updated 3 min ago')
      const c = use(`${t}todo_claim`, { id: '9' })
      done(c, 'You are on todo#9: Slow — thing.')
      const u = use(`${t}todo_update`, { id: '9', status: 'blocked', blocked_why: 'needs the fake tool' })
      done(u, 'Updated todo#9.')
      const d = use(`${t}todo_done`, { id: '14', note: 'Wrote the docs page.' })
      done(d, 'Marked todo#14 done.')
      say('All set: todo#14 is finished and `todo#99` stays code. See todo #9 too.')
    }
    // FAKE_RUNCALLS=1: the calls that move a workflow run, a library read, and one step report that failed.
    if (process.env.FAKE_RUNCALLS) {
      const t = 'mcp__agent-world__'
      done(use(`${t}task_begin`, { title: 'Add wordCount' }), 'Task begun: Add wordCount')
      done(use(`${t}plan_submit`, { path: '.agent-world/plan.md' }), 'Plan submitted.')
      done(use(`${t}library_get`, { id: 'tdd' }), '# tdd\nRed, green.')
      done(use(`${t}step_done`, { step: 'build' }), 'Step "build" reported done.')
      done(use(`${t}step_done`, { step: 'build' }), 'No task is open.', true)
      done(use(`${t}task_done`, { summary: 'wordCount added' }), 'Task done.')
      say('Done with wordCount.')
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
    // FAKE_FOLDERS=1: the agent names a folder of the project, and one outside it, as a real one does.
    if (process.env.FAKE_FOLDERS) {
      const fs = await import('node:fs')
      fs.mkdirSync(`${process.cwd()}/docs/guide`, { recursive: true })
      say(`The pages are in docs/guide/ and the build output is in ${process.cwd()}/src/lib, not in missing/dir/.`)
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
  // The screen is up and input is read: now it says so.
  await announceStart()
  await hook('Stop')
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
  const cancelled = await new Promise((resolve) => {
    const toggle = () => (picked[tab].has(cursor) ? picked[tab].delete(cursor) : picked[tab].add(cursor))
    const onKey = (d) => {
      const k = String(d), q = qs[tab]
      // Esc cancels the whole menu, as in Claude: the question is declined and the turn ends.
      // FAKE_NO_ESC=1: a menu that does nothing on Esc, so the card stays and the button has to say so.
      if (k === '\x1b' && !process.env.FAKE_NO_ESC) return (process.stdin.off('data', onKey), resolve(true))
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
          return resolve(false)
        }
        q.multiSelect ? toggle() : advance()
      } else if (q && !q.multiSelect && cursor === q.options.length + 1) other[tab] = (other[tab] ?? '') + k
      draw()
    }
    process.stdin.on('data', onKey)
  })
  if (cancelled) {
    process.stdout.write('\x1b[2J\x1b[Hquestion declined\r\n')
    // FAKE_QUIET_ESC=1: like the real program, nothing is reported after an Esc.
    if (!process.env.FAKE_QUIET_ESC) await hook('Stop')
    await new Promise(() => {})
  }
  const said = qs.map((q, i) => (other[i] ?? [...picked[i]].sort().map((n) => q.options[n - 1].label).join(','))).join(' | ')
  process.stdout.write(`\x1b[2J\x1b[Hanswers: ${said}\r\n`)
  await hook('PostToolUse', { tool_name: 'AskUserQuestion', tool_use_id: 'ask1', tool_input: { questions: qs } })
  await hook('Stop')
  await new Promise(() => {})
}
const said = await hook('UserPromptSubmit', { prompt: 'add a health check' })
// FAKE_SHOW_REMINDER=1: print what the office added to the request, so a spec can read it in the terminal.
if (process.env.FAKE_SHOW_REMINDER) console.log(`REMINDER: ${said?.hookSpecificOutput?.additionalContext ?? 'none'}`)
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
if (myName && myName === spawnFrom) await spawnViaOffice(spawnProvider, spawnTask.join(':'))
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
      // Esc rejects the plan, as in Claude: it stays in plan mode and nothing is chosen.
      if (k === '\x1b') return (process.stdin.off('data', onKey), process.stdout.write('\x1b[2J\x1b[Hplan rejected\r\n'), resolve())
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
if (process.env.FAKE_CHAT) await announceStart()
await hook('Stop')
// FAKE_CLEAR=1: behave like /clear — a new Claude session id in the same terminal, then more work.
if (process.env.FAKE_CLEAR) {
  sessionId = `cleared-${sessionId}`
  await hook('SessionStart', { source: 'clear' })
  await hook('PreToolUse', { tool_name: 'Grep', tool_input: { pattern: 'after-clear' } })
}
console.log('done, waiting for input')
