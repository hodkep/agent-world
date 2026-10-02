import { unwrapPasted } from '../../shared/pasted'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { ChatItem } from '../../shared/chat'
import type { Activity, ProcInfo } from '../../shared/types'
import { PICKABLE_MODES, cssColor, modeInfo } from '../../shared/modes'
import { type NeedActions, NeedPanel, type Need, needTitle } from '../panel/InputDialog'
import { type Row, type Sent, hasMarkdown, highlight, rowText, toMarkdown, toRows } from './format'
import { AgentIdContext } from '../files/context'
import { Lightbox, Picture } from './Images'
import { Markdown } from './markdown'
import { UserText } from './Mentions'
import { ToolCard } from './ToolCard'
import { type AgentActions, type AgentInfo, ModelChip, MoreMenu, UsageRing } from './AgentControls'
import { PixelIcon } from './PixelIcon'
import type { UsageLimits } from '../../shared/usage'

const BUSY: Activity[] = ['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting']
const VERB: Partial<Record<Activity, string>> = {
  thinking: 'is thinking',
  researching: 'is reading',
  implementing: 'is writing code',
  running: 'is running a command',
  delegating: 'is delegating',
  compacting: 'is compacting the conversation'
}

const SOURCE_TAG: Record<PaletteCommand['source'], string> = {
  'built-in': 'built-in',
  'project skill': 'skill',
  'project command': 'command',
  'your skill': 'skill',
  'your command': 'command',
  'plugin skill': 'skill',
  'plugin command': 'command'
}

interface Suggestion {
  label: string
  hint: string
  /** What replaces text[from, to]. */
  insert: string
  from: number
  to: number
  tag?: string
}

const drafts = new Map<string, string>()
const errText = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="copy-btn"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }
    >
      {done ? 'Copied' : label}
    </button>
  )
}

export function ChatView({
  agentId,
  agentName,
  activity,
  detail,
  mode,
  asleep,
  need,
  moreNeeds,
  needActions,
  visible,
  focusTick,
  info,
  actions,
  limits,
  onWake,
  onTerminal
}: {
  agentId: string
  agentName: string
  activity: Activity
  detail?: string
  /** Claude's permission mode as last reported. */
  mode?: string
  asleep: boolean
  /** What the agent is waiting on you for, if anything: answered right here, in the conversation. */
  need: Need | null
  moreNeeds: number
  needActions: NeedActions
  visible: boolean
  focusTick: number
  info?: AgentInfo
  actions: AgentActions
  limits: UsageLimits
  onWake: () => void
  onTerminal: () => void
}) {
  const waiting = need ? needTitle(need).toLowerCase() : null
  const [items, setItems] = useState<ChatItem[]>([])
  const [sent, setSent] = useState<(Sent & { at: number })[]>([])
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [away, setAway] = useState(false)
  const session = useRef('')
  const busy = BUSY.includes(activity)
  const [stopping, setStopping] = useState(false)
  useEffect(() => {
    if (!busy) setStopping(false)
  }, [busy])
  useEffect(() => {
    if (!stopping) return
    const t = setTimeout(() => setStopping(false), 8000)
    return () => clearTimeout(t)
  }, [stopping])

  useEffect(() => {
    let alive = true
    const load = () =>
      void window.aw.chatGet(agentId).then((c) => {
        if (!alive) return
        session.current = c.sessionId
        setItems(c.items)
      })
    load()
    const offItems = window.aw.onChatItems((id, sid, more) => {
      if (id !== agentId) return
      if (sid !== session.current) return load()
      setItems((cur) => {
        const seen = new Set(cur.map((i) => i.id))
        const fresh = more.filter((i) => !seen.has(i.id))
        return fresh.length ? [...cur, ...fresh].slice(-800) : cur
      })
    })
    const offReset = window.aw.onChatReset((id) => id === agentId && load())
    return () => {
      alive = false
      offItems()
      offReset()
    }
  }, [agentId])

  const allRows = useMemo(() => toRows(items, sent), [items, sent])
  // After a rewind Claude writes nothing until the next message, so the rewound messages are hidden here until it does.
  // A /btw side question is answered in Claude's own overlay; it shows here until dismissed and is not part of the conversation.
  const [btw, setBtw] = useState<{ question: string; answer: string | null } | null>(null)
  useEffect(() => window.aw.onBtw((id, b) => id === agentId && setBtw(b)), [agentId])
  const [cut, setCut] = useState<string | null>(null)
  useEffect(
    () =>
      window.aw.onComposerPrefill((id, t) => {
        if (id !== agentId) return
        const hit = [...allRows].reverse().find((r) => r.kind === 'user' && !r.pending && r.text.includes(t.slice(0, 40)))
        if (hit) setCut(hit.id)
      }),
    [agentId, allRows]
  )
  const visible_ = useMemo(() => {
    const at = cut ? allRows.findIndex((r) => r.id === cut) : -1
    return at < 0 ? allRows : allRows.filter((r, i) => i < at || ('pending' in r && r.pending))
  }, [allRows, cut])
  const found = useMemo(() => {
    const q = query?.trim().toLowerCase()
    return q ? visible_.filter((r) => rowText(r).toLowerCase().includes(q)) : visible_
  }, [visible_, query])
  // Long conversations render only the latest rows; older ones load on request so the view stays quick.
  const [shown, setShown] = useState(WINDOW)
  useEffect(() => setShown(WINDOW), [agentId])
  const rows = useMemo(() => (found.length > shown ? found.slice(-shown) : found), [found, shown])

  // Follow the conversation while the reader is at the bottom; leave them alone once they scroll up.
  // Rows grow after they are added (markdown, pictures, a streaming reply), so staying at the end is a standing job:
  // watch the newest rows and pin again whenever one changes height.
  useEffect(() => {
    const el = log.current
    if (!el) return
    const pin = () => {
      if (stick.current) el.scrollTop = el.scrollHeight
    }
    pin()
    const watch = new ResizeObserver(pin)
    for (const c of [...el.children].slice(-12)) watch.observe(c)
    const raf = requestAnimationFrame(() => requestAnimationFrame(pin))
    return () => {
      watch.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [rows, busy, waiting, visible])

  const onScroll = () => {
    const el = log.current!
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stick.current = near
    setAway(!near)
  }

  const send = useCallback(
    async (text: string) => {
      setError(null)
      const p = { id: `pending-${Date.now()}`, text: text.trim(), at: Date.now(), queued: BUSY.includes(activity) }
      // /clear empties the conversation at once (the main process does the same on its side); a busy agent only queues it.
      if (/^\/clear$/i.test(p.text) && !p.queued) {
        setItems([])
        setSent([])
      } else setSent((cur) => [...cur, p])
      stick.current = true
      try {
        await window.aw.chatSend(agentId, text)
      } catch (err) {
        setSent((cur) => cur.filter((x) => x.id !== p.id))
        // A /clear that did not go through leaves the conversation as it was.
        void window.aw.chatGet(agentId).then((c) => setItems(c.items))
        setError(errText(err))
        throw err
      }
      // If the transcript never shows it (the agent dropped it), stop pretending after a while.
      setTimeout(() => setSent((cur) => cur.filter((x) => x.id !== p.id)), 20_000)
    },
    [agentId, activity]
  )

  // Words selected in one of the agent's replies offer "Ask": they go into the message box as a quote.
  const chatEl = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ text: string; x: number; y: number; nx: number } | null>(null)
  useEffect(() => {
    const look = () => {
      const sel = window.getSelection()
      const el = log.current
      const root = chatEl.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el || !root) return setPick(null)
      const range = sel.getRangeAt(0)
      const reply = (range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest('.msg.assistant')
      const text = sel.toString().trim()
      if (!reply || !el.contains(reply) || !text) return setPick(null)
      const r = range.getBoundingClientRect()
      const c = root.getBoundingClientRect()
      const mid = r.left - c.left + r.width / 2
      const x = Math.max(8, Math.min(c.width - 148, mid - 64))
      setPick({ text, x, nx: mid - x, y: Math.max(4, r.top - c.top - 46) })
    }
    document.addEventListener('selectionchange', look)
    return () => document.removeEventListener('selectionchange', look)
  }, [])
  const quote = () => {
    if (!pick) return
    chatEl.current?.dispatchEvent(new CustomEvent('aw-quote', { detail: pick.text }))
    window.getSelection()?.removeAllRanges()
    setPick(null)
  }

  return (
    <AgentIdContext.Provider value={agentId}>
    <div
      className="chat"
      ref={chatEl}
      hidden={!visible}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') (e.preventDefault(), setQuery((q) => q ?? ''))
      }}
    >
      {pick && (
        <button className="ask-selection" style={{ left: pick.x, top: pick.y, ['--nx' as string]: `${pick.nx}px` }} onMouseDown={(e) => e.preventDefault()} onClick={quote} title="Add the selected words to your message as a quote">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12v8H8l-3.5 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Ask {agentName}
        </button>
      )}
      {query !== null && (
        <div className="chat-tools">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(null), e.stopPropagation())}
            placeholder="Search this conversation…"
            aria-label="Search this conversation"
            autoFocus
          />
          <span className="chat-count">{found.length} of {allRows.length}</span>
          <button onClick={() => setQuery(null)}>Close</button>
        </div>
      )}
      <ChatMenu agentId={agentId} markdown={() => toMarkdown(allRows, agentName)} onSearch={() => setQuery('')} />
      <div className="chat-log" ref={log} onScroll={onScroll} role="log" aria-label={`Conversation with ${agentName}`} aria-live="polite">
        {rows.length === 0 && (
          <p className="chat-empty">
            {query ? 'Nothing matches.' : asleep ? `${agentName} is asleep. Wake them to continue this conversation.` : `Say something to ${agentName}. The conversation appears here as it happens.`}
          </p>
        )}
        {rows.length < found.length && (
          <button className="earlier" onClick={() => setShown((n) => n + WINDOW)}>
            Show earlier ({found.length - rows.length} more)
          </button>
        )}
        {rows.map((r) => (
          <RowView key={r.id} row={r} agentId={agentId} agentName={agentName} busy={busy} asleep={asleep} onImage={setZoomed} onRewind={(text) => void window.aw.rewindTo(agentId, text).catch((err) => setError(errText(err)))} />
        ))}
        {busy && (
          <div className="live" role="status">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {stopping ? `Stopping ${agentName}…` : `${agentName} ${VERB[activity]}`}
            {!stopping && detail ? <span className="live-detail"> · {detail}</span> : null}
          </div>
        )}
      </div>
      {away && (
        <button className="jump" onClick={() => ((log.current!.scrollTop = log.current!.scrollHeight), (stick.current = true), setAway(false))}>
          Latest
        </button>
      )}
      {need && (
        <section className={`inline-need dialog kind-${need.kind}`} aria-label={`${agentName} is waiting for you`}>
          <header className="dialog-bar">
            <span className="blip" aria-hidden="true" />
            <b className="inline-who">{agentName}</b>
            <span className="dialog-kind">{needTitle(need)}</span>
            {moreNeeds > 0 && <span className="dialog-more">+{moreNeeds} waiting</span>}
          </header>
          <NeedPanel need={need} actions={needActions} onFinishInTerminal={onTerminal} />
        </section>
      )}
      {error && (
        <div className="chat-banner" role="alert">
          <span>{error}</span>
          <button onClick={onTerminal}>Open terminal</button>
        </div>
      )}
      {btw && (
        <section className="btw" aria-label="Side question">
          <div className="btw-q">
            <b>/btw</b> {btw.question}
          </div>
          <div className="btw-a" role="status">{btw.answer ?? 'Answering…'}</div>
          <button onClick={() => void window.aw.closeBtw(agentId)}>Dismiss</button>
        </section>
      )}
      {!asleep && <ProcBar agentId={agentId} />}
      <Composer
        agentId={agentId}
        agentName={agentName}
        asleep={asleep}
        busy={busy}
        blocked={!!waiting}
        mode={mode}
        visible={visible}
        focusTick={focusTick}
        info={info}
        actions={actions}
        limits={limits}
        onSend={send}
        onWake={onWake}
        onStop={() => void window.aw.chatInterrupt(agentId)}
        stopping={stopping}
        onStopping={setStopping}
        onError={setError}
        onImage={setZoomed}
      />
      {zoomed !== null && <Lightbox src={zoomed} onClose={() => setZoomed(null)} />}
    </div>
    </AgentIdContext.Provider>
  )
}

/** Commands and servers running under the agent, with a way to stop them. */
/** The conversation's less common tools, folded into one button so they do not take a row: search, notes, export. */
function ChatMenu({ agentId, markdown, onSearch }: { agentId: string; markdown: () => string; onSearch: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const wrap = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  const flash = (text: string) => (setNote(text), setTimeout(() => setNote(''), 2500))
  return (
    <span className="chat-menu menu-wrap" ref={wrap}>
      {note && <span className="chat-note" role="status">{note}</span>}
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Conversation tools" title="Search, save notes, copy" onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="pop-menu right" role="menu" aria-label="Conversation tools">
          <button role="menuitem" title="Search this conversation (⌘F)" onClick={() => (setOpen(false), onSearch())}>
            Search
          </button>
          <button
            role="menuitem"
            title="Save a short record of this conversation to the notes folder"
            onClick={() =>
              void window.aw.saveNotes(agentId).then(
                () => (setOpen(false), flash('Notes saved')),
                () => (setOpen(false), flash('Nothing to save yet'))
              )
            }
          >
            Save notes
          </button>
          <button role="menuitem" onClick={() => void navigator.clipboard.writeText(markdown()).then(() => (setOpen(false), flash('Copied')))}>
            Copy as Markdown
          </button>
        </div>
      )}
    </span>
  )
}

const WINDOW = 150

function ProcBar({ agentId }: { agentId: string }) {
  const [procs, setProcs] = useState<ProcInfo[]>([])
  useEffect(() => {
    let live = true
    const tick = () => void window.aw.listProcs(agentId).then((p) => live && setProcs((old) => (JSON.stringify(old) === JSON.stringify(p) ? old : p)))
    tick()
    const t = setInterval(tick, 3000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [agentId])
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  // Nothing left to list: the pop-up has nothing to show, so it closes with the last command.
  useEffect(() => {
    if (!procs.length) setOpen(false)
  }, [procs.length])
  if (!procs.length) return null
  const stop = (pid: number) => void window.aw.stopProc(agentId, pid).then(() => window.aw.listProcs(agentId).then(setProcs))
  return (
    <div className="procbar" ref={wrap}>
      <button className="procs-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <span className="procs-dot" aria-hidden="true" />
        {procs.length} {procs.length === 1 ? 'command' : 'commands'} running
      </button>
      {open && (
        <div className="procs-pop" role="dialog" aria-label="Running processes">
          <ul>
            {procs.map((p) => (
              <li key={p.pid}>
                <code title={p.command}>{p.command}</code>
                <button onClick={() => stop(p.pid)} aria-label={`Stop ${p.command}`}>
                  Stop
                </button>
              </li>
            ))}
          </ul>
          {procs.length > 1 && (
            <div className="procs-foot">
              <button onClick={() => procs.forEach((p) => stop(p.pid))}>Stop all</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RowView({ row: r, agentId, agentName, busy, asleep, onImage, onRewind }: { row: Row; agentId: string; agentName: string; busy: boolean; asleep: boolean; onImage: (src: string) => void; onRewind: (text: string) => void }) {
  switch (r.kind) {
    case 'user':
      return (
        <div className={`msg user ${r.pending ? 'pending' : ''}`}>
          <Clamped>
            <UserText agentId={agentId} text={r.text} onImage={onImage} />
          </Clamped>
          {!r.pending && !busy && !asleep && (
            <button className="rewind-btn" onClick={() => onRewind(r.text.replace(/@"[^"]*"\s*/g, '').trim() || r.text)} title="Go back to before this message: restore the conversation, and the code too if Claude tracked changes">
              Rewind
            </button>
          )}
          {r.pending && <span className="msg-meta">{r.queued ? 'queued: goes in when the current step finishes' : 'sending…'}</span>}
        </div>
      )
    case 'image':
      return (
        <div className="msg user">
          <Picture src={r.src} onOpen={onImage} label="Attached picture" />
        </div>
      )
    case 'shell':
      return (
        <div className="msg shell">
          <pre className="tc-cmd">
            <span aria-hidden="true">! </span>
            {r.command}
          </pre>
          {r.out && (r.out.stdout || r.out.stderr) && (
            <pre className={`shell-out ${r.out.stderr && !r.out.stdout ? 'is-error' : ''}`}>{[r.out.stdout, r.out.stderr].filter(Boolean).join('\n')}</pre>
          )}
        </div>
      )
    case 'command':
      return (
        <div className="msg cmd">
          <code>
            {r.name} {r.args}
          </code>
        </div>
      )
    case 'assistant':
      return (
        <div className="msg assistant">
          <div className="who">
            {agentName}
            <Copy text={r.text} />
          </div>
          <Markdown text={r.text} agentId={agentId} />
          {r.took !== undefined && <div className="msg-meta">worked for {r.took >= 60 ? `${Math.floor(r.took / 60)}m ${r.took % 60}s` : `${r.took}s`}</div>}
        </div>
      )
    case 'thinking':
      return (
        <div className="msg think">
          <span className="tc-dot" aria-hidden="true" /> Thought about it
        </div>
      )
    case 'tool':
      return <ToolCard run={r.run} working={busy} onImage={onImage} />
    case 'note':
      return r.detail ? <SummaryNote text={r.text} detail={r.detail} /> : <div className="msg note">{r.text}</div>
  }
}

/** A long message kept to a few lines until asked for; the whole text stays in the page so it can be selected and quoted. */
function Clamped({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => !open && setLong(el.scrollHeight > el.clientHeight + 1)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [open])
  return (
    <>
      <div ref={box} className={`clamp ${open ? '' : 'clamped'} ${long && !open ? 'fade' : ''}`}>
        {children}
      </div>
      {(long || open) && (
        <button className="clamp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

/** The summary /compact leaves behind is for the model, so it sits behind a button. */
function SummaryNote({ text, detail }: { text: string; detail: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="msg note summary">
      <span>{text}</span>
      <button className="clamp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide summary' : 'Show summary'}
      </button>
      {open && <div className="summary-body">{detail}</div>}
    </div>
  )
}

interface Attachment {
  id: string
  name: string
  path: string
  /** A local preview for pictures. */
  preview?: string
  /** Set when it is a thing picked on the Preview page: the words that go with it, sent with the message but not shown in the box. */
  context?: { text: string; label: string }
}

function Composer({
  agentId,
  agentName,
  asleep,
  busy,
  blocked,
  mode,
  visible,
  focusTick,
  info,
  actions,
  limits,
  onSend,
  onWake,
  onStop,
  stopping,
  onStopping,
  onError,
  onImage
}: {
  agentId: string
  agentName: string
  asleep: boolean
  busy: boolean
  blocked: boolean
  mode?: string
  visible: boolean
  focusTick: number
  info?: AgentInfo
  actions: AgentActions
  limits: UsageLimits
  onSend: (text: string) => Promise<void>
  onWake: () => void
  onStop: () => void
  stopping: boolean
  onStopping: (v: boolean) => void
  onError: (msg: string) => void
  onImage: (src: string) => void
}) {
  const [text, setText] = useState(() => drafts.get(agentId) ?? '')
  const [commands, setCommands] = useState<PaletteCommand[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [at, setAt] = useState(0)
  const [caret, setCaret] = useState(0)
  const [attached, setAttached] = useState<Attachment[]>([])
  // Words quoted from a reply sit above the box as cards; they join the message as "> " lines when it is sent.
  const [quotes, setQuotes] = useState<{ text: string; note: string }[]>([])
  const [over, setOver] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const sent = useRef<string[]>([])
  const recall = useRef(-1)
  // Ctrl+R: the words being searched for, kept while pressing it again to reach older matches.
  const search = useRef<string | null>(null)
  const shell = text.startsWith('!')
  useEffect(() => window.aw.onComposerPrefill((id, t) => id === agentId && (setText(t), box.current?.focus())), [agentId])
  const modeWrap = useRef<HTMLSpanElement>(null)
  // The mode menu closes on Esc or a click anywhere else.
  useEffect(() => {
    if (!modeOpen) return
    const away = (e: MouseEvent) => !modeWrap.current?.contains(e.target as Node) && setModeOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setModeOpen(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [modeOpen])

  useEffect(() => {
    drafts.set(agentId, text)
  }, [agentId, text])
  useEffect(() => {
    if (visible) requestAnimationFrame(() => box.current?.focus())
  }, [visible, focusTick])
  // Suggestions come from the same lists as the ⌘K palette and the Files tab.
  useEffect(() => {
    void window.aw.listCommands(agentId).then(setCommands, () => {})
    void window.aw.code.files(agentId).then(setFiles, () => setFiles([]))
  }, [agentId])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
    // Measured again when the chat comes into view: a hidden box measures as nothing.
  }, [text, visible])

  // Files on disk are mentioned by their path; pasted pictures and other blobs are saved first.
  const attach = useCallback(
    async (list: File[], context?: Attachment['context']) => {
      for (const f of list) {
        try {
          const onDisk = window.aw.pathOf(f)
          const path = onDisk || (await window.aw.saveAttachment(agentId, f.name, await f.arrayBuffer(), f.type))
          setAttached((cur) => [...cur, { id: `${Date.now()}-${cur.length}`, name: f.name || path.split('/').pop()!, path, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, ...(context && { context }) }])
        } catch (err) {
          onError(errText(err))
        }
      }
      box.current?.focus()
    },
    [agentId, onError]
  )

  // Words selected in a reply arrive as a quote card; more can follow, each as its own card.
  useEffect(() => {
    const chat = box.current?.closest('.chat')
    if (!chat) return
    const on = (e: Event) => {
      const words = String((e as CustomEvent<string>).detail ?? '').trim()
      if (!words) return
      setQuotes((q) => [...q, { text: words, note: '' }])
      box.current?.focus()
    }
    chat.addEventListener('aw-quote', on)
    return () => chat.removeEventListener('aw-quote', on)
  }, [])

  // Something picked on the Preview page arrives as one chip (its picture, and the words that describe it) to send with a question about it.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; text: string; file: File | null; label?: string; handled?: boolean }>).detail
      // The same agent can be open in the side panel and in a grid cell; only the first box takes it.
      if (d.agentId !== agentId || d.handled) return
      d.handled = true
      const context = { text: d.text, label: d.label ?? 'an element' }
      if (d.file) void attach([d.file], context)
      else setAttached((cur) => [...cur, { id: `${Date.now()}-${cur.length}`, name: context.label, path: '', context }])
      box.current?.focus()
    }
    window.addEventListener('aw-context', on)
    return () => window.removeEventListener('aw-context', on)
  }, [agentId, attach])

  // "/co" completes a command or skill and "@fi" a file or folder, wherever the caret is in the message.
  const end = Math.min(caret, text.length)
  const before = text.slice(0, end)
  const slash = /(?:^|\s)\/(\S*)$/.exec(before)
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(before)
  const startOf = (m: RegExpExecArray) => m.index + (/^\s/.test(m[0]) ? 1 : 0)
  const folders = useMemo(() => [...new Set(files.flatMap((f) => f.split('/').slice(0, -1).map((_, i, a) => `${a.slice(0, i + 1).join('/')}/`)))], [files])
  const suggestions = useMemo<Suggestion[]>(() => {
    // Inserted mid-sentence, a completion needs a space after it unless one is already there.
    const tail = /^\s|^$/.test(text.slice(end)) ? '' : ' '
    if (slash) {
      const q = slash[1]!.toLowerCase()
      const from = startOf(slash)
      // Names that start with what was typed come first, then names containing it, then descriptions.
      const rank = (c: PaletteCommand) => {
        const n = c.name.toLowerCase()
        return n.startsWith(q) ? 0 : n.includes(q) ? 1 : c.description.toLowerCase().includes(q) ? 2 : 3
      }
      return commands
        .map((c) => ({ c, r: rank(c) }))
        .filter((x) => x.r < 3)
        .sort((a, b) => a.r - b.r)
        .slice(0, 40)
        .map(({ c }) => ({ label: `/${c.name}`, hint: c.description, insert: `/${c.name}${c.args ? ' ' : tail}`, from, to: end, tag: SOURCE_TAG[c.source] }))
    }
    if (mention) {
      const q = mention[1]!.toLowerCase()
      const from = startOf(mention)
      return [...folders, ...files]
        .filter((f) => f.toLowerCase().includes(q))
        .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)))
        .slice(0, 40)
        .map((f) => ({ label: f, hint: '', tag: f.endsWith('/') ? 'folder' : 'file', from, to: end, insert: (/\s/.test(f) ? `@"${f}"` : `@${f}`) + (f.endsWith('/') ? '' : ' ') }))
    }
    return []
  }, [slash?.[1], mention?.[1], commands, files, folders, text, end])
  const apply = (s: Suggestion) => {
    setText(text.slice(0, s.from) + s.insert + text.slice(s.to))
    const pos = s.from + s.insert.length
    setCaret(pos)
    requestAnimationFrame(() => box.current?.setSelectionRange(pos, pos))
  }
  useEffect(() => setAt(0), [suggestions.length, slash?.[1], mention?.[1]])

  const submit = async () => {
    const value = unwrapPasted(text).trim()
    if (!value && attached.length === 0 && quotes.length === 0) return
    const mentions = attached.filter((a) => !a.context).map((a) => `@"${a.path}"`).join(' ')
    // What was picked on the Preview page goes ahead of the question, words first and then its picture.
    const picked = attached.filter((a) => a.context).map((a) => `${a.context!.text}${a.path ? `\nPicture of it: @"${a.path}"` : ''}`).join('\n\n')
    // Attached files come first so the message reads "look at these: …".
    // Each quote is followed by what was written about it.
    const asked = quotes.map((q) => [q.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'), q.note.trim()].filter(Boolean).join('\n\n')).join('\n\n')
    const body = picked ? [mentions, picked, value].filter(Boolean).join('\n\n') : mentions ? `${mentions}${value ? `\n${value}` : ''}` : value
    const full = asked ? [asked, body].filter(Boolean).join('\n\n') : body
    try {
      await onSend(full)
      if (value) (sent.current.unshift(value), (recall.current = -1))
      setText('')
      setQuotes([])
      for (const a of attached) if (a.preview) URL.revokeObjectURL(a.preview)
      setAttached([])
    } catch {
      /* the error is shown above the composer; the text stays for another try */
    }
  }

  if (asleep)
    return (
      <div className="composer asleep">
        <span>{agentName} is asleep.</span>
        <button className="primary" onClick={onWake}>
          Wake {agentName}
        </button>
      </div>
    )

  return (
    <div
      className={`composer ${over ? 'over' : ''} ${shell ? 'is-shell' : ''}`}
      style={{ borderTopColor: mode && mode !== 'default' ? cssColor(modeInfo(mode).color) : undefined }}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        void attach([...e.dataTransfer.files])
      }}
    >
      {suggestions.length > 0 && (
        <ul className="suggest" role="listbox" aria-label="Suggestions">
          {suggestions.map((s, i) => (
            <li key={s.label} ref={i === at ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined} role="option" aria-selected={i === at} onMouseDown={(e) => (e.preventDefault(), apply(s), box.current?.focus())} onMouseEnter={() => setAt(i)}>
              <b>{s.label}</b>
              {s.hint && <span className="sg-desc">{s.hint}</span>}
              {s.tag && <i className={`tag tag-${s.tag}`}>{s.tag}</i>}
            </li>
          ))}
        </ul>
      )}
      {attached.length > 0 && (
        <ul className="attached" aria-label="Attached files">
          {attached.map((a) => (
            <li key={a.id} className={a.context ? 'chip-context' : undefined} title={a.context?.text}>
              {a.context && <span className="chip-from">Preview</span>}
              {a.preview ? (
                <button className="chip-img" onClick={() => onImage(a.preview!)} aria-label={`Preview ${a.name}`}>
                  <img src={a.preview} alt="" />
                </button>
              ) : (
                <span className="chip-file" aria-hidden="true" />
              )}
              <span className="chip-name" title={a.context ? undefined : a.path}>
                {a.context?.label ?? a.name}
              </span>
              <button className="chip-x" aria-label={`Remove ${a.name}`} onClick={() => setAttached((cur) => cur.filter((x) => x.id !== a.id))} />
            </li>
          ))}
        </ul>
      )}
      {!shell && hasMarkdown(text) && (
        <div className="composer-preview md" aria-label="Preview of your message">
          <Markdown text={text} agentId={agentId} />
        </div>
      )}
      <div className="cbox">
        {quotes.length > 0 && (
          <ul className="quote-cards" aria-label="Quoted from the conversation">
            {quotes.map((q, i) => (
              <li key={i}>
                <div className="quote-body">
                  <blockquote>{q.text}</blockquote>
                  <textarea
                    rows={1}
                    value={q.note}
                    onChange={(e) => setQuotes((cur) => cur.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), box.current?.focus())
                    }}
                    placeholder="What about this?"
                    aria-label="What to do about this quote"
                  ></textarea>
                </div>
                <button className="chip-x" aria-label="Remove this quote" onClick={() => setQuotes((cur) => cur.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        )}
        {shell && <span className="shell-badge" title="Runs this command directly, without Claude interpreting it. Claude then sees the output.">shell</span>}
        <div className="composer-input">
          {/* Same text, same metrics, drawn behind the transparent textarea so commands and @files get a tint. */}
          <div className="composer-mirror" ref={mirror} aria-hidden="true">
            {highlight(text).map((p, i) => (p.kind === 'plain' ? p.text : <mark key={i} className={`tok-${p.kind}`}>{p.text}</mark>))}
            {'\n'}
          </div>
        <textarea
          ref={box}
          onScroll={(e) => mirror.current && (mirror.current.scrollTop = e.currentTarget.scrollTop)}
          value={text}
          rows={1}
          placeholder={blocked ? `${agentName} is waiting for you above` : busy ? `${agentName} is working… your message goes in next` : `Message ${agentName}  ·  / commands and skills  ·  @ files`}
          aria-label={`Message ${agentName}`}
          onChange={(e) => ((search.current = null), setText(e.target.value), setCaret(e.target.selectionStart))}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onPaste={(e) => {
            // Text copied with <pasted_content> markers goes in without them.
            const pasted = e.clipboardData.getData('text/plain')
            if (pasted !== unwrapPasted(pasted)) {
              e.preventDefault()
              document.execCommand('insertText', false, unwrapPasted(pasted).replace(/\n$/, ''))
              return
            }
            const files = [...e.clipboardData.files]
            if (files.length) (e.preventDefault(), void attach(files))
          }}
          onKeyDown={(e) => {
            // Enter on a command that is already typed in full sends it, instead of completing it to itself.
            const complete = suggestions.length > 0 && suggestions[at]!.insert.trim() !== text.trim()
            if (suggestions.length) {
              if (e.key === 'ArrowDown') (e.preventDefault(), setAt((i) => Math.min(suggestions.length - 1, i + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setAt((i) => Math.max(0, i - 1)))
              else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && (slash || mention) && complete)) (e.preventDefault(), apply(suggestions[at]!))
              if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key) || (e.key === 'Enter' && !e.shiftKey && (slash || mention) && complete)) return
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            } else if (e.key === 'Escape' && busy) (onStopping(true), onStop())
            else if (e.key === 'Tab' && e.shiftKey) (e.preventDefault(), void window.aw.chatCycleMode(agentId).catch((err) => onError(errText(err))))
            else if (e.key === 'r' && e.ctrlKey && sent.current.length) {
              e.preventDefault()
              search.current ??= text.trim().toLowerCase()
              const at = sent.current.findIndex((m, i) => i > recall.current && m.toLowerCase().includes(search.current!))
              if (at >= 0) (setText(sent.current[at]!), (recall.current = at))
            } else if (e.key === 'ArrowUp' && !text && sent.current.length) {
              e.preventDefault()
              recall.current = Math.min(sent.current.length - 1, recall.current + 1)
              setText(sent.current[recall.current]!)
            } else if (e.key === 'ArrowDown' && recall.current >= 0 && text === sent.current[recall.current]) {
              e.preventDefault()
              recall.current -= 1
              setText(recall.current >= 0 ? sent.current[recall.current]! : '')
            }
          }}
        />
        </div>
        <div className="cbar">
          <input ref={pick} type="file" multiple hidden onChange={(e) => (void attach([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <button className="cb-icon" onClick={() => pick.current?.click()} aria-label="Attach" title="Attach pictures or files (or paste, or drop them here)">
            <PixelIcon name="plus" />
          </button>
        <span className="menu-wrap cb-anchor" ref={modeWrap}>
          <button
            className="mode-chip"
            style={{ color: cssColor(modeInfo(mode).color) }}
            onClick={() => setModeOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={modeOpen}
            title="Permission mode: how much Claude may do without asking. Shift+Tab moves to the next one."
          >
            {switching ? 'Switching…' : modeInfo(mode).label}
          </button>
          {modeOpen && (
            <div className="pop-menu mode-menu" role="menu" aria-label="Permission mode">
              {PICKABLE_MODES.map((m) => (
                <button
                  key={m.id}
                  role="menuitemradio"
                  aria-checked={(mode ?? 'default') === m.id}
                  onClick={() => {
                    setModeOpen(false)
                    if ((mode ?? 'default') === m.id) return
                    setSwitching(true)
                    void window.aw
                      .setMode(agentId, m.id)
                      .catch((err) => onError(errText(err)))
                      .finally(() => setSwitching(false))
                  }}
                >
                  <span className="mode-dot" style={{ background: cssColor(m.color) }} />
                  <span className="mode-name">
                    {m.label}
                    {(mode ?? 'default') === m.id ? ' ✓' : ''}
                  </span>
                  <span className="mode-blurb">{m.blurb}</span>
                </button>
              ))}
            </div>
          )}
        </span>
          {info && <ModelChip info={info} actions={actions} />}
          <span className="cb-spacer" />
          {info && <UsageRing info={info} limits={limits} actions={actions} />}
          {info && <MoreMenu info={info} actions={actions} />}
          {busy && text.trim() && (
            <button
              className="cb-chip"
              onClick={() => {
                // Interrupt the current step, give Claude a moment to stop, then send.
                onStopping(true)
                onStop()
                setTimeout(() => void submit(), 700)
              }}
              title="Interrupt what it is doing and send this now"
            >
              Send now
            </button>
          )}
          {busy ? (
            <button className="cb-icon cb-stop" onClick={() => (onStopping(true), onStop())} disabled={stopping} aria-label="Stop" title="Interrupt (Esc)">
              <PixelIcon name="stop" />
            </button>
          ) : (
            <button className="cb-icon cb-send" onClick={() => void submit()} disabled={!text.trim() && attached.length === 0 && quotes.length === 0} aria-label="Send" title="Send (Enter) · Shift+Enter new line · Shift+Tab changes mode">
              <PixelIcon name="send" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
