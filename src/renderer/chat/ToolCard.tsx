import { spanLabel } from './format'
import { useContext, useState } from 'react'
import { AgentIdContext, openFileEvent } from '../files/context'
import { Picture } from './Images'
import { Code, Markdown } from './markdown'
import { argRows, mcpHeadline, parseMcpName, resultNote, resultSections, toolLookup } from './mcp'
import { bashTitle } from './titles'
import { MonitorCard, ScheduleCard, UnscheduleLine } from './WatchCards'

export interface ToolRun {
  name: string
  input: Record<string, unknown>
  /** undefined while the tool is still running. */
  result?: { text: string; isError: boolean }
  /** Pictures the tool returned (a screenshot, an image file read). */
  images?: string[]
  /** Whole seconds between the call and its result, when that is worth saying. */
  sec?: number
  /** The row it is on, so the list of what is still armed can scroll to it. */
  id?: string
  /** When it was called, in ms. */
  at?: number
  /** A monitor: each line it printed. */
  firings?: { at: number; text: string }[]
  /** A monitor whose source ended by itself, and when. */
  ended?: number
  /** A schedule that a later call cancelled. */
  cancelled?: boolean
}

const s = (v: unknown) => (typeof v === 'string' ? v : '')
const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
const lines = (t: string) => (t ? t.split('\n') : [])

function File({ path }: { path: string }) {
  const agentId = useContext(AgentIdContext)
  return (
    <button className="tc-file file-link as-link" title={`${path}\nClick to open`} onClick={() => agentId && openFileEvent(agentId, path)}>
      <span className="tc-dir">{dir(path).replace(/^.*\/(?=[^/]+\/[^/]*$)/, '…/')}</span>
      <b>{base(path)}</b>
    </button>
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

const FENCE_LANG: Record<string, string> = { js: 'javascript', ts: 'typescript', sh: 'shell', bash: 'shell', zsh: 'shell', yml: 'yaml', py: 'python' }

/** A tool call to an MCP server: a headline in words, with the details a click away. */
function McpCard({ run, status, onImage }: { run: ToolRun; status: string; onImage: (src: string) => void }) {
  const [open, setOpen] = useState(false)
  const { server, tool } = parseMcpName(run.name)!
  const h = mcpHeadline(tool, run.input)
  const out = run.result?.text ?? ''
  const failed = run.result?.isError
  const note = failed ? 'failed' : resultNote(tool, out)
  const sections = out ? resultSections(out) : []
  const structured = sections.some((x) => x.title)
  return (
    <div className={`tc is-${status}`}>
      <div className="tc-head">
        <span className="tc-dot" aria-hidden="true" />
        <span className="srv-badge" title={`MCP server: ${server}`}>{server}</span>
        <span className="tc-name">
          <b>{h.verb}</b>{' '}
          {h.link ? (
            <a className="tc-link" href={h.link} onClick={(e) => (e.preventDefault(), void window.aw.openExternal(h.link!).catch(() => {}))}>
              {h.target}
            </a>
          ) : (
            <span className="tc-muted">{h.target}</span>
          )}
        </span>
        <span className="tc-status">{status === 'running' ? 'running…' : run.sec ? spanLabel(run.sec) : ''}</span>
      </div>
      <div className="tc-meta">
        <button className="tc-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Details'}
        </button>
        <span className="tc-muted">
          {tool}
          {note ? ` · ${note}` : ''}
        </span>
      </div>
      {open && (
        <>
          <dl className="kv">
            {argRows(run.input).map(([k, v]) => (
              <div key={k} className="kv-row">
                <dt>{k}</dt>
                <dd>{/^https?:\/\/\S+$/.test(v) ? <a href={v} onClick={(e) => (e.preventDefault(), void window.aw.openExternal(v).catch(() => {}))}>{v}</a> : v}</dd>
              </div>
            ))}
          </dl>
          {structured ? (
            <div className="tc-result">
              {sections.map((x, i) => (
                <div key={i} className="tc-sec">
                  {x.title && <h4>{x.title}</h4>}
                  {x.text && <pre>{x.text}</pre>}
                  {x.code?.map((c, k) => <Code key={k} text={c.text} lang={FENCE_LANG[c.lang] ?? (c.lang || 'plaintext')} />)}
                </div>
              ))}
              <button className="tc-more" onClick={() => void navigator.clipboard.writeText(out)}>Copy result</button>
            </div>
          ) : (
            <Output text={out} error={failed} />
          )}
        </>
      )}
      {run.images && run.images.length > 0 && (
        <div className="tc-images">
          {run.images.map((src, i) => (
            <Picture key={i} src={src} onOpen={onImage} label={`${tool} result`} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Looking up tools is bookkeeping: one quiet line, never a block of JSON. */
function ToolLookupLine({ run, status }: { run: ToolRun; status: string }) {
  const l = toolLookup(run.input, run.result?.text)
  return (
    <div className={`tc-line is-${status}`}>
      <span className="tc-dot" aria-hidden="true" />
      {l.kind === 'load' ? (
        <>
          <span className="tc-what">{status === 'running' ? 'Loading' : 'Loaded'} {l.tools.length} {l.tools.length === 1 ? 'tool' : 'tools'}</span>
          {l.tools.slice(0, 8).map((t, i) => (
            <span key={i} className="chip">
              {t.server && <span className="srv">{t.server}</span>} {t.tool.replace(/^browser_/, '')}
            </span>
          ))}
          {l.tools.length > 8 && <span className="tc-muted">+{l.tools.length - 8} more</span>}
        </>
      ) : (
        <>
          <span className="tc-what">Looked for tools matching <b>“{l.query}”</b></span>
          {l.found !== null && <span className="tc-muted">{l.found} found</span>}
        </>
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
  // A command starts folded to its headline; a click on it opens the command and what it printed, and another folds it again.
  const [open, setOpen] = useState(false)
  if (name === 'ToolSearch') return <ToolLookupLine run={run} status={status} />
  if (name === 'Monitor') return <MonitorCard run={run} />
  if (name === 'Schedule') return <ScheduleCard run={run} />
  if (name === 'Unschedule') return <UnscheduleLine run={run} />
  if (parseMcpName(name)) return <McpCard run={run} status={status} onImage={onImage} />
  let head: React.ReactNode = <b>{name}</b>
  let body: React.ReactNode = null

  switch (name) {
    case 'Bash': {
      const cmd = s(input.command)
      const title = bashTitle(input)
      head = (
        <span title={cmd}>
          {title.ran ? (
            <>
              Ran <span className="tc-muted">{title.text}</span>
            </>
          ) : (
            title.text
          )}
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
      body = (
        <>
          <pre className="tc-cmd">{JSON.stringify(input, null, 1).slice(0, 600)}</pre>
          <Output text={out} error={failed} />
        </>
      )
  }

  const foldable = name === 'Bash'
  const state = status === 'running' ? 'running…' : [status === 'failed' ? 'failed' : '', run.sec ? spanLabel(run.sec) : ''].filter(Boolean).join(' · ')
  return (
    <div className={`tc is-${status}${foldable ? ' foldable' : ''}`}>
      {foldable ? (
        <button className="tc-head tc-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={open ? 'Fold' : 'Show the command and its output'}>
          <span className="tc-dot" aria-hidden="true" />
          <span className="tc-name">{head}</span>
          <span className="tc-status">{state}</span>
          <span className="tc-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
        </button>
      ) : (
        <div className="tc-head">
          <span className="tc-dot" aria-hidden="true" />
          <span className="tc-name">{head}</span>
          <span className="tc-status">{state}</span>
        </div>
      )}
      {(!foldable || open) && body}
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
