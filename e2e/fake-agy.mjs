#!/usr/bin/env node
// Stand-in for the agy CLI: draws the screens a real agy 1.2.17 draws (idle, working, asking permission), and keeps
// its conversation the way agy does (a SQLite file of protobuf steps, plus a line per prompt in history.jsonl).
import { appendFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const args = process.argv.slice(2)
const home = process.env.AW_AGY_HOME
if (args[0] === '--version') (console.log('1.2.17'), process.exit(0))
if (args[0] === '-p' && args[1] === '/usage') {
  console.log('Gemini Models\tWeekly Limit Remaining\t100%\t2026-10-12T06:23:31Z\nGemini Models\tFive Hour Limit Remaining\t73%\t2026-10-05T16:23:31Z\nClaude and GPT models\tFive Hour Limit Remaining\t100%\t2026-10-05T16:30:41Z')
  process.exit(0)
}

const enc = (n) => { const o = []; let v = n; while (v > 127) { o.push((v & 127) | 128); v = Math.floor(v / 128) } o.push(v); return Buffer.from(o) }
const varint = (f, v) => Buffer.concat([enc(f << 3), enc(v)])
const str = (f, s) => { const b = Buffer.from(s); return Buffer.concat([enc((f << 3) | 2), enc(b.length), b]) }
const msg = (f, ...p) => { const b = Buffer.concat(p); return Buffer.concat([enc((f << 3) | 2), enc(b.length), b]) }
const stamp = () => { const t = Date.now(); return msg(5, msg(1, varint(1, Math.floor(t / 1000)), varint(2, (t % 1000) * 1e6))) }

const conv = args.includes('--conversation') ? args[args.indexOf('--conversation') + 1] : randomUUID()
mkdirSync(join(home, 'conversations'), { recursive: true })
const db = new DatabaseSync(join(home, 'conversations', `${conv}.db`))
db.exec('create table if not exists steps (idx integer primary key, step_type integer not null default 0, status integer not null default 0, step_payload blob)')
const addStep = (type, status, payload) => db.prepare('insert into steps (idx, step_type, status, step_payload) values ((select coalesce(max(idx), -1) + 1 from steps), ?, ?, ?)').run(type, status, payload)

const W = 110
const rule = '─'.repeat(W)
const footer = (left) => left.padEnd(W - 'Gemini 3.8 Flash · high'.length) + 'Gemini 3.8 Flash · high'
const draw = (lines) => process.stdout.write('\x1b[2J\x1b[H' + lines.join('\r\n'))
const idle = (shown = '') => draw(['', '  Antigravity CLI 1.2.17', '  Gemini 3.8 Flash (High)', '', rule, `> ${shown}`, rule, footer('? for shortcuts')])
const working = (said) => draw(['', `> ${said}`, '⣷  Generating...', rule, '>', rule, footer('esc to cancel')])
const asking = (cmd) => draw(['', '● Bash(' + cmd + ') (ctrl+o to expand)', rule, 'Requesting permission for:', `   ${cmd}`, 'Run this command?', '> 1. Yes, run command', "  2. Yes, and always allow in this conversation for commands that start with 'x'", '  3. Yes, and always allow for commands that start with \'x\' (Persist to settings.json)', '  4. No, cancel', '  ↑/↓ Navigate · tab Amend · ctrl+g edit/expand command', footer('esc to cancel')])

let typed = ''
let state = 'idle'
let timer
const submit = (text) => {
  appendFileSync(join(home, 'history.jsonl'), JSON.stringify({ display: text, timestamp: Date.now(), workspace: process.cwd(), conversationId: conv }) + '\n')
  addStep(14, 3, Buffer.concat([varint(1, 14), stamp(), msg(19, str(2, text))]))
  if (/permission/.test(text)) {
    state = 'asking'
    return asking('touch note.txt')
  }
  state = 'working'
  working(text)
  timer = setTimeout(() => {
    addStep(15, 3, Buffer.concat([varint(1, 15), stamp(), msg(20, str(1, `echo: ${text}`))]))
    state = 'idle'
    idle()
  }, Number(process.env.FAKE_DELAY_MS ?? 1200))
}

process.stdin.setRawMode?.(true)
process.stdin.resume()
process.stdin.on('data', (d) => {
  const s = d.toString()
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
