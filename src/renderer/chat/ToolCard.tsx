import { useState } from 'react'
import { Picture } from './Images'
import { Code, Markdown } from './markdown'
import { bashTitle } from './titles'

export interface ToolRun {
  name: string
  input: Record<string, unknown>
  /** undefined while the tool is still running. */
  result?: { text: string; isError: boolean }
  /** Pictures the tool returned (a screenshot, an image file read). */
  images?: string[]
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
const lines = (t: string) => (t ? t.split('\n') : [])

function File({ path }: { path: string }) {
  return (
    <span className="tc-file" title={path}>
      <span className="tc-dir">{dir(path).replace(/^.*\/(?=[^/]+\/[^/]*$)/, '…/')}</span>
      <b>{base(path)}</b>
    </span>
  )
}

/** Output that starts short and opens on demand. */
function Output({ text, error }: { text: string; error?: boolean }) {
  const [open, setOpen] = useState(false)
  const all = lines(text)
  if (all.length === 0) return null
  const shown = open ? all : all.slice(0, 6)
  return (
    <div className={`tc-out ${error ? 'is-error' : ''}`}>
      <pre>{shown.join('\n')}</pre>
      <button className="tc-more tc-copy" onClick={() => void navigator.clipboard.writeText(text)} aria-label="Copy output">
        Copy output
      </button>
      {all.length > 6 && (
        <button className="tc-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : `Show all ${all.length} lines`}
        </button>
      )}
    </div>
  )
}

/** Old text out, new text in, as lines a reader can scan. */
function Diff({ from, to }: { from: string; to: string }) {
  const [open, setOpen] = useState(false)
  const rows = [...lines(from).map((t) => ({ k: '-', t })), ...lines(to).map((t) => ({ k: '+', t }))]
  const shown = open ? rows : rows.slice(0, 14)
  return (
    <div className="tc-diff">
      {shown.map((r, i) => (
        <div key={i} className={r.k === '-' ? 'del' : 'add'}>
          <span aria-hidden="true">{r.k}</span>
          {r.t || ' '}
        </div>
      ))}
      {rows.length > 14 && (
        <button className="tc-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : `Show all ${rows.length} lines`}
        </button>
      )}
    </div>
  )
}

/** What a tool call looks like in the conversation: a headline you can read at a glance, details on demand. */
export function ToolCard({ run, working, onImage }: { run: ToolRun; working: boolean; onImage: (src: string) => void }) {
  const { name, input, result } = run
  const failed = result?.isError
  const status = result ? (failed ? 'failed' : 'done') : working ? 'running' : 'unknown'
  const out = result?.text ?? ''
  let head: React.ReactNode = <b>{name}</b>
  let body: React.ReactNode = null

  switch (name) {
    case 'Bash': {
      const cmd = s(input.command)
      const title = bashTitle(input)
      head = (
        <span title={cmd}>
          Ran <span className="tc-muted">{title}</span>
        </span>
      )
      body = (
        <>
          <Code text={cmd} lang="shell" className="tc-cmd" prompt="$ " />
          <Output text={out} error={failed} />
        </>
      )
      break
    }
    case 'Read':
      head = <span>Read <File path={s(input.file_path)} /></span>
      body = failed ? <Output text={out} error /> : null
      break
    case 'Write':
      head = <span>Wrote <File path={s(input.file_path)} /></span>
      body = <Diff from="" to={s(input.content)} />
      break
    case 'Edit':
      head = <span>Edited <File path={s(input.file_path)} /></span>
      body = <Diff from={s(input.old_string)} to={s(input.new_string)} />
      break
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? (input.edits as { old_string?: string; new_string?: string }[]) : []
      head = <span>Edited <File path={s(input.file_path)} /> <span className="tc-muted">({edits.length} changes)</span></span>
      body = edits.slice(0, 4).map((e, i) => <Diff key={i} from={s(e.old_string)} to={s(e.new_string)} />)
      break
    }
    case 'Grep':
    case 'Glob':
      head = <span>{name === 'Grep' ? 'Searched for' : 'Found files'} <code>{s(input.pattern)}</code>{s(input.path) && <span className="tc-muted"> in {s(input.path)}</span>}</span>
      body = <Output text={out} error={failed} />
      break
    case 'WebFetch':
      head = <span>Fetched <code>{s(input.url)}</code></span>
      body = failed ? <Output text={out} error /> : null
      break
    case 'WebSearch':
      head = <span>Searched the web for <code>{s(input.query)}</code></span>
      break
    case 'Task':
    case 'Agent':
      head = <span>Delegated <span className="tc-muted">{s(input.description) || s(input.subagent_type)}</span></span>
      body = out ? <Output text={out} error={failed} /> : null
      break
    case 'TodoWrite': {
      const todos = Array.isArray(input.todos) ? (input.todos as { content?: string; status?: string }[]) : []
      head = <span>Updated the to-do list</span>
      body = (
        <ul className="tc-todos">
          {todos.map((t, i) => (
            <li key={i} className={`is-${t.status}`}>
              {t.content}
            </li>
          ))}
        </ul>
      )
      break
    }
    case 'TaskCreate':
      head = <span>Added task <span className="tc-muted">{s(input.subject)}</span></span>
      break
    case 'TaskUpdate':
      head = <span>Task {s(input.taskId)} → <b>{s(input.status) || 'updated'}</b></span>
      break
    case 'ExitPlanMode':
      head = <span>Proposed a plan</span>
      body = <div className="tc-plan"><Markdown text={s(input.plan)} /></div>
      break
    case 'AskUserQuestion': {
      const qs = Array.isArray(input.questions) ? (input.questions as { question?: string }[]) : []
      head = <span>Asked {qs.length === 1 ? 'a question' : `${qs.length} questions`}</span>
      body = (
        <>
          <ul className="tc-todos">{qs.map((q, i) => <li key={i}>{q.question}</li>)}</ul>
          <Output text={out} error={failed} />
        </>
      )
      break
    }
    default:
      if (name.startsWith('mcp__')) {
        const [, server, tool] = name.split('__')
        head = <span>{server} <span className="tc-muted">· {tool}</span></span>
      }
      body = (
        <>
          <pre className="tc-cmd">{JSON.stringify(input, null, 1).slice(0, 600)}</pre>
          <Output text={out} error={failed} />
        </>
      )
  }

  return (
    <div className={`tc is-${status}`}>
      <div className="tc-head">
        <span className="tc-dot" aria-hidden="true" />
        <span className="tc-name">{head}</span>
        <span className="tc-status">{status === 'running' ? 'running…' : status === 'failed' ? 'failed' : ''}</span>
      </div>
      {body}
      {run.images && run.images.length > 0 && (
        <div className="tc-images">
          {run.images.map((src, i) => (
            <Picture key={i} src={src} onOpen={onImage} label={`${name} result`} />
          ))}
        </div>
      )}
    </div>
  )
}
