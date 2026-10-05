#!/usr/bin/env node
// Stand-in for the agy CLI: draws the screens a real agy 1.2.17 draws (idle, working, asking permission), and keeps
// its conversation the way agy does (a SQLite file of protobuf steps, plus a line per prompt in history.jsonl).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Node's own notice that SQLite is experimental would be drawn under the screen; real agy prints nothing of the kind.
process.removeAllListeners('warning')
const args = process.argv.slice(2)
const home = process.env.AW_AGY_HOME
if (args[0] === '--version') (console.log('1.2.17'), process.exit(0))
// FAKE_SIGNED_OUT_FILE=<path>: agy counts as signed out until that file exists.
if (args[0] === '-p' && args[1] === '/usage' && process.env.FAKE_SIGNED_OUT_FILE && !existsSync(process.env.FAKE_SIGNED_OUT_FILE)) process.exit(1)
if (args[0] === '-p' && args[1] === '/usage') {
  console.log('Gemini Models\tWeekly Limit Remaining\t100%\t2026-10-12T06:23:31Z\nGemini Models\tFive Hour Limit Remaining\t73%\t2026-10-05T16:23:31Z\nClaude and GPT models\tFive Hour Limit Remaining\t100%\t2026-10-05T16:30:41Z')
  process.exit(0)
}

// agy keeps its MCP servers in one global list that its own `mcp add` and `mcp remove` edit.
if (args[0] === 'plugin') {
  console.log('No imported plugins.')
  process.exit(0)
}
if (args[0] === 'mcp') {
  const file = process.env.AW_AGY_CONFIG
  let cfg = { mcpServers: {} }
  try { cfg = JSON.parse(readFileSync(file, 'utf8')) } catch {}
  // Like the real one, the list prints the whole command line, keys and all.
  if (args[1] === 'list') {
    console.log('NAME      TYPE   STATUS    COMMAND/URL')
    for (const [n, e] of Object.entries(cfg.mcpServers)) console.log(`${n.padEnd(9)} stdio  ${e.disabled ? 'disabled' : 'enabled '} ${[e.command, ...(e.args ?? [])].join(' ')}`)
    process.exit(0)
  }
  if (args[1] === 'add') {
    const dash = args.indexOf('--')
    const env = {}
    for (let i = 2; i < dash; i++) if (args[i] === '--env') { const [k, v] = args[++i].split('='); env[k] = v }
    const name = args.slice(2, dash).filter((a, i, all) => all[i - 1] !== '--env' && a !== '--env').at(-1)
    cfg.mcpServers[name] = { command: args[dash + 1], args: args.slice(dash + 2), env }
  } else if (args[1] === 'remove') delete cfg.mcpServers[args[2]]
  writeFileSync(file, JSON.stringify(cfg, null, 2))
  process.exit(0)
}

const enc = (n) => { const o = []; let v = n; while (v > 127) { o.push((v & 127) | 128); v = Math.floor(v / 128) } o.push(v); return Buffer.from(o) }
const varint = (f, v) => Buffer.concat([enc(f << 3), enc(v)])
const str = (f, s) => { const b = Buffer.from(s); return Buffer.concat([enc((f << 3) | 2), enc(b.length), b]) }
const msg = (f, ...p) => { const b = Buffer.concat(p); return Buffer.concat([enc((f << 3) | 2), enc(b.length), b]) }
const stamp = () => { const t = Date.now(); return msg(5, msg(1, varint(1, Math.floor(t / 1000)), varint(2, (t % 1000) * 1e6))) }

// FAKE_ARGS and FAKE_ENV_FILE: log how this session was started, so a test can check it.
if (process.env.FAKE_ARGS) appendFileSync(process.env.FAKE_ARGS, args.join(' ') + '\n')
if (process.env.FAKE_ENV_FILE) appendFileSync(process.env.FAKE_ENV_FILE, JSON.stringify({ url: process.env.AW_MCP_URL ?? null, token: process.env.AW_AGENT_TOKEN ?? null }) + '\n')
let conv = args.includes('--conversation') ? args[args.indexOf('--conversation') + 1] : randomUUID()
mkdirSync(join(home, 'conversations'), { recursive: true })
let db = new DatabaseSync(join(home, 'conversations', `${conv}.db`))
db.exec('create table if not exists steps (idx integer primary key, step_type integer not null default 0, status integer not null default 0, step_payload blob)')
const openDb = (id) => {
  const d = new DatabaseSync(join(home, 'conversations', `${id}.db`))
  d.exec('create table if not exists steps (idx integer primary key, step_type integer not null default 0, status integer not null default 0, step_payload blob)')
  return d
}
const stepIn = (d, type, status, payload) => d.prepare('insert into steps (idx, step_type, status, step_payload) values ((select coalesce(max(idx), -1) + 1 from steps), ?, ?, ?)').run(type, status, payload)
const addStep = (type, status, payload) => db.prepare('insert into steps (idx, step_type, status, step_payload) values ((select coalesce(max(idx), -1) + 1 from steps), ?, ?, ?)').run(type, status, payload)

const W = process.stdout.columns ?? 100
const rule = '─'.repeat(W)
// Shift+Tab cycles how much it may do alone; the footer names every level but the first.
const MODES = ['', 'accept-edits', 'plan']
let mode = args.includes('--mode') ? Math.max(0, MODES.indexOf(args[args.indexOf('--mode') + 1])) : 0
const footer = (left) => {
  const right = (mode && left.startsWith('?') ? `${MODES[mode]} · ` : '') + 'Gemini 3.8 Flash · high'
  return left.padEnd(W - right.length) + right
}
const draw = (lines) => process.stdout.write('\x1b[2J\x1b[H' + lines.join('\r\n'))
const idle = (shown = '') => draw(['', '  Antigravity CLI 1.2.17', '  Gemini 3.8 Flash (High)', '', rule, `> ${shown}`, rule, footer('? for shortcuts')])
const working = (said) => draw(['', `> ${said}`, '⣷  Generating...', rule, '>', rule, footer('esc to cancel')])
const asking = (cmd) => draw(['', '● Bash(' + cmd + ') (ctrl+o to expand)', 'Command', rule, 'Requesting permission for:', `   ${cmd}`, 'Run this command?', '> 1. Yes, run command', "  2. Yes, and always allow in this conversation for commands that start with 'x'", '  3. Yes, and always allow for commands that start with \'x\' (Persist to settings.json)', '  4. No, cancel', '  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command', footer('esc to cancel')])

// /btw: a side question, answered in a box of "┃" lines over the screen while the agent stays free.
const btwBox = (q, answer) => draw(['', `┃ /btw ${q}`, '┃ ', answer === null ? '┃ ⣽  Thinking...' : `┃   ${answer}`, ...(answer === null ? [] : ['┃ Tab to expand · Enter/Esc to dismiss']), rule, '>', rule, footer('? for shortcuts')])
let typed = ''
let state = 'idle'
let timer
// What was asked, with the step each message began at: /rewind lists these, and going back removes the steps from there on.
let prompts = []
let cursor = 0
const rewindPanel = () => draw(['', rule, 'Rewind Conversation', ...prompts.flatMap((p, i) => [`${cursor === i ? '>' : ' '} ${p.text.length > 70 ? p.text.slice(0, 70) + '...' : p.text}`, '    (1m ago)']), `${cursor === prompts.length ? '>' : ' '} (current)`, 'Keyboard: ↑/↓ Navigate  enter Select  esc Cancel', footer('')])
const submit = (text) => {
  if (/^\/btw\s+\S/.test(text)) {
    const q = text.replace(/^\/btw\s+/, '')
    state = 'btw'
    btwBox(q, null)
    setTimeout(() => state === 'btw' && btwBox(q, `the answer to: ${q}`), 700)
    return
  }
  if (text === '/fork') {
    // Branching copies the conversation into a new file and carries on in it.
    const fresh = randomUUID()
    const copy = openDb(fresh)
    for (const r of db.prepare('select step_type, status, step_payload from steps order by idx').all()) stepIn(copy, r.step_type, r.status, r.step_payload)
    conv = fresh
    db = copy
    state = 'idle'
    return idle()
  }
  if (text === '/rewind') {
    state = 'rewind'
    cursor = prompts.length
    return rewindPanel()
  }
  prompts.push({ text, step: db.prepare('select coalesce(max(idx), -1) + 1 as n from steps').get().n })
  appendFileSync(join(home, 'history.jsonl'), JSON.stringify({ display: text, timestamp: Date.now(), workspace: process.cwd(), conversationId: conv }) + '\n')
  addStep(14, 3, Buffer.concat([varint(1, 14), stamp(), msg(19, str(2, text))]))
  // "start subagent": the answer names a conversation of the subagent's own, which works for a while and then reports.
  if (/subagent/.test(text)) {
    const child = randomUUID()
    const kid = openDb(child)
    stepIn(kid, 101, 3, Buffer.concat([varint(1, 101), stamp()]))
    stepIn(kid, 15, 3, Buffer.concat([varint(1, 15), stamp(), msg(20, msg(7, str(1, 'k1'), str(2, 'run_command'), str(3, JSON.stringify({ CommandLine: 'ls -la' }))))]))
    stepIn(kid, 132, 3, Buffer.concat([varint(1, 132), stamp(), msg(5, msg(4, str(1, 'k1'), str(2, 'run_command'), str(3, JSON.stringify({ CommandLine: 'ls -la' })))), msg(140, msg(2, str(1, 'total 0')))]))
    const made = `Created the following subagents:\n{\n  "conversationId":  "${child}",\n  "workspaceUris": []\n}\nThe subagents will send you a message.`
    addStep(132, 3, Buffer.concat([varint(1, 132), stamp(), msg(5, msg(4, str(1, 'call_s'), str(2, 'invoke_subagent'), str(3, JSON.stringify({ Subagents: [{ Prompt: 'List the files.', Role: 'File Researcher', TypeName: 'research' }] })))), msg(140, msg(2, str(1, made)))]))
    state = 'working'
    working(text)
    timer = setTimeout(() => {
      stepIn(kid, 15, 3, Buffer.concat([varint(1, 15), stamp(), msg(20, str(1, 'The folder is empty.'))]))
      addStep(15, 3, Buffer.concat([varint(1, 15), stamp(), msg(20, str(1, 'The subagent said: the folder is empty.'))]))
      state = 'idle'
      idle()
    }, Number(process.env.FAKE_SUB_MS ?? 9000))
    return
  }
  if (/permission/.test(text)) {
    state = 'asking'
    return asking('touch note.txt')
  }
  state = 'working'
  working(text)
  timer = setTimeout(() => {
    // Each answer carries the token counts agy records: read 2 (cache part in 5), written 3 (thinking 9 plus reply 10).
    addStep(15, 3, Buffer.concat([varint(1, 15), stamp(), msg(5, msg(9, varint(2, 1000), varint(3, 50), varint(9, 30), varint(10, 20))), msg(20, str(1, `echo: ${text}`))]))
    state = 'idle'
    idle()
  }, Number(process.env.FAKE_DELAY_MS ?? 1200))
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', (d) => {
  const s = d.toString()
  if (state === 'btw') {
    if (s === '\x1b' || s === '\r') {
      state = 'idle'
      return idle()
    }
    return
  }
  if (state === 'rewind') {
    if (s === '\x1b[A') cursor = Math.max(0, cursor - 1)
    else if (s === '\x1b[B') cursor = Math.min(prompts.length, cursor + 1)
    else if (s === '\x1b') {
      state = 'idle'
      return idle()
    } else if (s === '\r') {
      state = 'idle'
      if (cursor === prompts.length) return idle()
      // Going back removes everything from that message on, in the same file, and puts the message back in the box.
      const back = prompts[cursor]
      db.prepare('delete from steps where idx >= ?').run(back.step)
      prompts = prompts.slice(0, cursor)
      typed = back.text
      return idle(typed)
    }
    return rewindPanel()
  }
  if (state === 'asking') {
    if (s === '\r') {
      addStep(132, 3, Buffer.concat([varint(1, 132), stamp(), msg(5, msg(4, str(1, 'call_1'), str(2, 'run_command'))), msg(140, msg(2, str(1, 'done')))]))
      state = 'idle'
      return idle()
    }
    if (s === '\x1b') {
      state = 'idle'
      return idle()
    }
    return
  }
  if (s === '\x1b[Z' && state === 'idle') {
    mode = (mode + 1) % MODES.length
    return idle(typed)
  }
  if (s === '\x1b' && state === 'working') {
    clearTimeout(timer)
    state = 'idle'
    return idle()
  }
  for (const piece of s.replace(/\x1b\[20[01]~/g, '').split(/(\r)/)) {
    if (piece === '\r') {
      if (typed.trim()) (submit(typed.trim()), (typed = ''))
    } else if (state === 'idle') {
      typed += piece
      idle(typed)
    }
  }
})

const first = args.includes('-i') ? args[args.indexOf('-i') + 1] : ''
idle()
if (first) setTimeout(() => submit(first), 300)
