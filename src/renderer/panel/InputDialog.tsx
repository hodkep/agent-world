import { useEffect, useRef, useState } from 'react'
import { fileAccess } from './fileAccess'
import type { Decision, PermissionRequest, Question, QuestionAnswer, TerminalMenu } from '../../shared/types'
import { PixelWord } from '../PixelWord'
import { Markdown } from '../chat/markdown'
import { splitRecommended } from './recommended'

export type Need =
  | { kind: 'trust'; path: string }
  | { kind: 'permission'; request: PermissionRequest }
  | { kind: 'plan'; text: string }
  | { kind: 'question'; questions: Question[] }
  | ({ kind: 'menu' } & TerminalMenu)

export const needTitle = (n: Need) => (n.kind === 'trust' ? 'TRUST?' : n.kind === 'permission' ? (n.request.kind === 'file' ? 'FILE ACCESS' : 'ALLOW?') : n.kind === 'plan' ? 'PLAN' : n.kind === 'menu' ? 'ASKS YOU' : 'QUESTION')

export interface NeedActions {
  trust: (yes: boolean) => void
  decide: (id: string, d: Decision) => void
  plan: (choice: 0 | 1 | 2, feedback?: string) => Promise<void>
  answer: (answers: QuestionAnswer[]) => Promise<void>
  menu: (index: number) => Promise<void>
  cancelMenu: () => Promise<void>
  cancelNeed: () => Promise<void>
}

interface Props {
  agentName: string
  need: Need
  /** How many more requests wait behind this one. */
  more: number
  onClose: () => void
  onFinishInTerminal: () => void
  actions: NeedActions
}

/**
 * The question itself: what is being asked and the ways to answer it. The pop-up box and the chat share this, so a
 * permission, a plan, a question and the trust prompt look and work the same wherever they are answered.
 */
export function NeedPanel({ need, actions, onFinishInTerminal, hint, onProgress }: { need: Need; actions: NeedActions; onFinishInTerminal: () => void; hint?: string; /** Told where a question box is ("1 OF 3"), for the title bar to show. */ onProgress?: (p: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const attempt = async (f: () => Promise<void>) => {
    setError(null)
    try {
      await f()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    }
  }
  // The questions are laid out as one piece (steps, page, buttons), so they bring their own body and footer.
  if (need.kind === 'question') return <Questions questions={need.questions} onSend={(a) => attempt(() => actions.answer(a))} onCancel={() => attempt(actions.cancelNeed)} error={error} onFinishInTerminal={onFinishInTerminal} onProgress={onProgress} />
  return (
    <>
      <div className="dialog-body">
        {need.kind === 'trust' && <Trust path={need.path} onAnswer={actions.trust} />}
        {need.kind === 'permission' && <Permission req={need.request} onDecide={actions.decide} />}
        {need.kind === 'plan' && <Plan text={need.text} onAnswer={(c, f) => attempt(() => actions.plan(c, f))} onCancel={() => attempt(actions.cancelNeed)} />}
        {need.kind === 'menu' && <TerminalChoice menu={need} onPick={(i) => attempt(() => actions.menu(i))} onCancel={() => attempt(actions.cancelMenu)} onTerminal={onFinishInTerminal} />}
      </div>
      {error && (
        <div className="dialog-error" role="alert">
          {error} <button onClick={onFinishInTerminal}>Open terminal</button>
        </div>
      )}
      <footer className="dialog-foot">
        <button onClick={onFinishInTerminal}>Answer in terminal</button>
        {hint && <span className="hint">{hint}</span>}
      </footer>
    </>
  )
}

/** The 8-bit box that opens from an agent's "needs you" marker: one request at a time, keyboard first. */
export function InputDialog({ agentName, need, more, onClose, onFinishInTerminal, actions }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState('')
  // Focus the box once the terminal has finished grabbing it, and let Esc close it wherever focus ended up.
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      if (!box.current?.contains(document.activeElement)) box.current?.focus()
    })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`dialog kind-${need.kind}`} role="dialog" aria-modal="true" aria-label={`${agentName}: ${needTitle(need)}`} tabIndex={-1}>
        <header className="dialog-bar">
          <span className="blip" aria-hidden="true" />
          <PixelWord text={agentName} scale={2} color="#08070c" />
          <span className="dialog-kind">{needTitle(need)}</span>
          {need.kind === 'question' && progress && <span className="dialog-count">{progress}</span>}
          {more > 0 && <span className="dialog-more">+{more} waiting</span>}
          <button className="dialog-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)" />
        </header>
        <NeedPanel need={need} actions={actions} onFinishInTerminal={onFinishInTerminal} hint="Esc closes this box; the agent keeps waiting." onProgress={setProgress} />
      </div>
    </div>
  )
}

function Trust({ path, onAnswer }: { path: string; onAnswer: (yes: boolean) => void }) {
  return (
    <>
      <p className="dialog-line">Trust this workspace before the agent starts?</p>
      <code className="dialog-code">{path}</code>
      <div className="dialog-actions">
        <button className="primary" onClick={() => onAnswer(true)}>
          Trust folder
        </button>
        <button onClick={() => onAnswer(false)}>Exit</button>
      </div>
    </>
  )
}

function Permission({ req, onDecide }: { req: PermissionRequest; onDecide: (id: string, d: Decision) => void }) {
  const file = req.kind === 'file' ? fileAccess(req.tool, req.detail) : null
  return (
    <>
      {file ? (
        // A read, a new file or an edit: what is done, to which file, why it asks, and the change itself.
        <>
          <div className="fa-row">
            <span className={`fa-tag ${file.kind === 'NEW FILE' ? 'new' : ''}`}>{file.kind}</span>
            {file.reason && <span className="fa-tag warn">{file.reason}</span>}
            {file.summary && <span className="fa-sum">{file.summary}</span>}
          </div>
          <div className="fa-path">{file.path}</div>
          {file.diff.length > 0 && (
            <pre className="fa-diff" aria-label="The change">
              {file.diff.map((d, n) => (
                <span key={n} className={d.sign === '+' ? 'add' : 'del'}>{`${d.sign === '+' ? '+' : '−'} ${d.n}  ${d.text}\n`}</span>
              ))}
            </pre>
          )}
        </>
      ) : (
        <>
          <p className="dialog-line">
            Wants to use <b>{req.tool}</b>
          </p>
          <pre className="dialog-code">{req.detail}</pre>
        </>
      )}
      <div className="dialog-actions">
        {req.options?.length ? (
          // The program's own answers, in its words and order: the first is the plain yes.
          req.options.map((label, n) => (
            <button key={n} className={n === 0 ? 'primary' : ''} onClick={() => onDecide(req.id, { option: n })}>
              {label}
            </button>
          ))
        ) : (
          <>
            <button className="primary" onClick={() => onDecide(req.id, 'allow')}>
              Allow
            </button>
            <button onClick={() => onDecide(req.id, 'deny')}>Deny</button>
          </>
        )}
      </div>
    </>
  )
}

function Plan({ text, onAnswer, onCancel }: { text: string; onAnswer: (choice: 0 | 1 | 2, feedback?: string) => Promise<void>; onCancel: () => Promise<void> }) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (c: 0 | 1 | 2, f?: string) => {
    setBusy(true)
    await onAnswer(c, f)
    setBusy(false)
  }
  return (
    <>
      <p className="dialog-line">Ready to work. Review the plan:</p>
      {text ? (
        <div className="plan-md">
          <Markdown text={text} />
        </div>
      ) : (
        <p className="dialog-line">The plan is shown in the terminal.</p>
      )}
      <div className="dialog-actions">
        <button className="primary" disabled={busy} onClick={() => void go(0)}>
          Approve · auto-accept edits
        </button>
        <button disabled={busy} onClick={() => void go(1)}>
          Approve · review each edit
        </button>
        <button disabled={busy} onClick={() => void (setBusy(true), onCancel().finally(() => setBusy(false)))} title="Reject the plan, as Esc does in the terminal">
          Reject plan
        </button>
      </div>
      <form
        className="dialog-actions"
        onSubmit={(e) => {
          e.preventDefault()
          void go(2, feedback)
        }}
      >
        <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change?" aria-label="Plan feedback" />
        <button type="submit" disabled={busy}>
          Keep planning
        </button>
      </form>
    </>
  )
}

interface Draft {
  picks: number[]
  other: string
  /** Single choice only: the free-text row is the chosen one. */
  useOther: boolean
}
const blank = (): Draft => ({ picks: [], other: '', useOther: false })
const ready = (q: Question, d: Draft) => (q.multiSelect ? d.picks.length > 0 : d.useOther ? d.other.trim().length > 0 : d.picks.length === 1)

/** One page per question, then a review page. Arrow keys move, Space/Enter choose, ←/→ turn pages, 1-9 choose a row. */
function Questions({
  questions,
  onSend,
  onCancel,
  error,
  onFinishInTerminal,
  onProgress
}: {
  questions: Question[]
  onSend: (a: QuestionAnswer[]) => Promise<void>
  onCancel: () => Promise<void>
  error: string | null
  onFinishInTerminal: () => void
  onProgress?: (p: string) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => questions.map(blank))
  const [page, setPage] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const review = page >= questions.length
  const q = questions[page]
  const d = drafts[page]
  useEffect(() => onProgress?.(review ? 'REVIEW' : `${page + 1} OF ${questions.length}`), [page, review, questions.length, onProgress])

  const edit = (f: (d: Draft) => Draft) => setDrafts((ds) => ds.map((x, i) => (i === page ? f(x) : x)))
  const go = (p: number) => {
    setPage(Math.max(0, Math.min(questions.length, p)))
    setCursor(0)
  }
  const choose = (i: number) => {
    if (!q) return
    if (q.multiSelect) edit((x) => ({ ...x, picks: x.picks.includes(i) ? x.picks.filter((p) => p !== i) : [...x.picks, i].sort((a, b) => a - b) }))
    else {
      edit((x) => ({ ...x, picks: [i], useOther: false }))
      go(page + 1)
    }
  }
  const send = async () => {
    setBusy(true)
    await onSend(drafts.map((x, i) => (questions[i]!.multiSelect ? { picks: x.picks } : x.useOther ? { picks: [], other: x.other.trim() } : { picks: x.picks })))
    setBusy(false)
  }

  const rows = q ? q.options.length + (q.multiSelect ? 0 : 1) : 0
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowDown') setCursor((c) => Math.min(rows - 1, c + 1))
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1))
    else if (e.key === 'ArrowRight') go(page + 1)
    else if (e.key === 'ArrowLeft') go(page - 1)
    else if (q && /^[1-9]$/.test(e.key) && Number(e.key) <= rows) {
      const i = Number(e.key) - 1
      setCursor(i)
      if (i < q.options.length) choose(i)
      else edit((x) => ({ ...x, useOther: true, picks: [] }))
    } else if (q && (e.key === ' ' || e.key === 'Enter') && cursor < q.options.length) choose(cursor)
    else if (q && e.key === 'Enter' && cursor === q.options.length) edit((x) => ({ ...x, useOther: true, picks: [] }))
    else if (review && e.key === 'Enter' && drafts.every((x, i) => ready(questions[i]!, x))) void send()
    else return
    e.preventDefault()
  }

  return (
    <div onKeyDown={onKey} className="qd">
      <ol className="steps" aria-label="Questions">
        {questions.map((x, i) => (
          <li key={i}>
            <button className={`step ${i === page ? 'on' : ''} ${ready(x, drafts[i]!) ? 'done' : ''}`} onClick={() => go(i)} aria-current={i === page}>
              <span className="n" aria-hidden="true">
                <span>{i + 1}</span>
              </span>
              <span className="t">{x.header || `Q${i + 1}`}</span>
            </button>
          </li>
        ))}
        <li>
          <button className={`step send ${review ? 'on' : ''}`} onClick={() => go(questions.length)} aria-current={review}>
            <span className="n" aria-hidden="true">
              <span>{questions.length + 1}</span>
            </span>
            <span className="t">Send</span>
          </button>
        </li>
      </ol>

      <div className="qd-body">
        {q && d && (
          <>
            <p className="qd-q">{q.question}</p>
            <div className="qd-kind">
              {q.header && <span className="chip">{q.header}</span>}
              <span>{q.multiSelect ? 'Pick any that apply' : 'Pick one'}</span>
            </div>
            <ul className="choices" role={q.multiSelect ? 'group' : 'radiogroup'} aria-label={q.question}>
              {q.options.map((o, i) => {
                const on = d.picks.includes(i) && !d.useOther
                const { title, recommended } = splitRecommended(o.label)
                return (
                  <li key={o.label}>
                    <button className={`choice ${cursor === i ? 'cursor' : ''} ${on ? 'on' : ''}`} role={q.multiSelect ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => (setCursor(i), choose(i))}>
                      <span className={`cap ${q.multiSelect ? 'tick' : ''}`} aria-hidden="true">
                        {i + 1}
                      </span>
                      <span className="label">
                        <b>{title}</b>
                        {o.description && <span className="desc">{o.description}</span>}
                      </span>
                      {recommended && <span className="badge">Recommended</span>}
                    </button>
                  </li>
                )
              })}
              {!q.multiSelect && (
                <li>
                  <div className={`choice other ${cursor === q.options.length ? 'cursor' : ''} ${d.useOther ? 'on' : ''}`}>
                    <span className="cap" aria-hidden="true">
                      {q.options.length + 1}
                    </span>
                    <span className="label">
                      <input
                        value={d.other}
                        placeholder="Something else…"
                        aria-label="Your own answer"
                        onFocus={() => (setCursor(q.options.length), edit((x) => ({ ...x, useOther: true, picks: [] })))}
                        onChange={(e) => edit((x) => ({ ...x, other: e.target.value, useOther: true, picks: [] }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && d.other.trim()) {
                            e.preventDefault()
                            go(page + 1)
                          }
                          if (e.key === 'ArrowUp') (e.currentTarget.blur(), setCursor(q.options.length - 1))
                        }}
                      />
                    </span>
                    <span />
                  </div>
                </li>
              )}
            </ul>
          </>
        )}

        {review && (
          <>
            <p className="qd-q">Check your answers</p>
            <dl className="qd-review">
              {questions.map((x, i) => {
                const dr = drafts[i]!
                const said = dr.useOther ? [dr.other.trim()].filter(Boolean) : dr.picks.map((p) => splitRecommended(x.options[p]!.label).title)
                return (
                  <div className="row" key={i}>
                    <dt>{x.question}</dt>
                    <dd className={said.length ? '' : 'missing'}>
                      {said.length ? (
                        <span className="tags">
                          {said.map((t) => (
                            <span className="tag" key={t}>
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : (
                        'not answered yet'
                      )}
                    </dd>
                    <button className="edit" onClick={() => go(i)} aria-label={`Change the answer to: ${x.question}`}>
                      Edit
                    </button>
                  </div>
                )
              })}
            </dl>
          </>
        )}
      </div>

      {error && (
        <div className="dialog-error" role="alert">
          {error} <button onClick={onFinishInTerminal}>Open terminal</button>
        </div>
      )}
      <footer className="qd-foot">
        <button className="cancel" disabled={busy} onClick={() => void (setBusy(true), onCancel().finally(() => setBusy(false)))} title="Decline the question, as Esc does in the terminal">
          Cancel question
        </button>
        <button className="term" onClick={onFinishInTerminal} title="Answer this in the agent's terminal instead">
          <span className="gl" aria-hidden="true">
            &gt;_
          </span>
          Answer in terminal
        </button>
        {q && (
          <span className="hints" aria-hidden="true">
            <span>
              <kbd>1</kbd>–<kbd>{rows}</kbd> choose
            </span>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> move
            </span>
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> pages
            </span>
          </span>
        )}
        {review ? (
          <>
            <button onClick={() => go(questions.length - 1)}>Back</button>
            <button className="primary" disabled={busy || !drafts.every((x, i) => ready(questions[i]!, x))} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send answers'}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => go(page - 1)} disabled={page === 0}>
              Back
            </button>
            <button className={q && d && ready(q, d) ? 'primary' : ''} onClick={() => go(page + 1)}>
              {page === questions.length - 1 ? 'Review' : 'Next'}
            </button>
          </>
        )}
      </footer>
    </div>
  )
}

/** One of Claude's own menus, answered here: what it is about, then each option as a button. */
function TerminalChoice({ menu, onPick, onCancel, onTerminal }: { menu: TerminalMenu; onPick: (i: number) => Promise<void>; onCancel: () => Promise<void>; onTerminal: () => void }) {
  const [busy, setBusy] = useState(false)
  const go = async (f: () => Promise<void>) => {
    setBusy(true)
    await f()
    setBusy(false)
  }
  return (
    <>
      <p className="dialog-line">{menu.title}</p>
      {menu.context && <pre className="dialog-code">{menu.context}</pre>}
      <div className="dialog-actions choice-buttons">
        {/* A screen that takes a code from the browser or typing can only be finished in the terminal. */}
        {menu.terminalOnly && (
          <button className="primary" onClick={onTerminal}>
            Open terminal
          </button>
        )}
        {menu.options.map((o, i) => (
          <button key={o} className={i === 0 ? 'primary' : ''} disabled={busy} onClick={() => void go(() => onPick(i))}>
            {o}
          </button>
        ))}
        {/* Esc does nothing on a new Claude Code's first questions, so a Cancel there would do nothing either. */}
        {!menu.terminalOnly && menu.cancellable !== false && (
          <button disabled={busy} onClick={() => void go(onCancel)} title={menu.hint}>
            Cancel
          </button>
        )}
      </div>
    </>
  )
}
