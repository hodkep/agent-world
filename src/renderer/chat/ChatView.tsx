import { unwrapPasted } from '../../shared/pasted'
import { parseAgentMail } from '../../shared/mail'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { ChatItem } from '../../shared/chat'
import type { Activity, ProcInfo } from '../../shared/types'
import { PICKABLE_MODES, cssColor, modeInfo } from '../../shared/modes'
import { type NeedActions, NeedPanel, type Need, needTitle } from '../panel/InputDialog'
import { type Row, type Sent, highlight, markdownSpans, rowText, toMarkdown, toRows } from './format'
import { UndoStack, type Snap } from './undo'
import { AgentIdContext } from '../files/context'
import { Lightbox, Picture } from './Images'
import { AttachmentViewer } from './ImageEditor'
import { Markdown } from './markdown'
import { UserText } from './Mentions'
import { CrewLine } from './Crew'
import { Delegation } from './Delegation'
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
  waitingSubagents,
  onWake,
  onTerminal
}: {
  agentId: string
  agentName: string
  /** Subagents waiting on you (a permission request), by id. */
  waitingSubagents?: Set<string>
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
  // Once the agent is free, a queued message that the transcript still does not show was dropped.
  useEffect(() => {
    if (busy) return
    const t = setTimeout(() => setSent((cur) => cur.filter((x) => x.at > Date.now() - 20_000)), 20_000)
    return () => clearTimeout(t)
  }, [busy, sent.length])
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
  // Searching keeps the whole conversation in place and marks the matches in it; it does not cut the rows down.
  const found = visible_
  const searching = !!query?.trim()
  // Long conversations render only the latest rows; older ones load on request so the view stays quick.
  const [shown, setShown] = useState(WINDOW)
  useEffect(() => setShown(WINDOW), [agentId])
  const rows = useMemo(() => (!searching && found.length > shown ? found.slice(-shown) : found), [found, shown, searching])

  // Every match of the search, marked with the page's own highlighting; `at` is the one being looked at.
  const [hits, setHits] = useState(0)
  const [at, setAt] = useState<number | null>(null)
  const ranges = useRef<Range[]>([])
  useEffect(() => setAt(null), [query])
  useEffect(() => {
    const q = query?.trim().toLowerCase()
    const root = log.current
    if (!q || !root || !visible) {
      ranges.current = []
      setHits(0)
      return
    }
    const list: Range[] = []
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.nodeValue!.toLowerCase()
      // Text inside a folded-away section cannot be looked at, so it is not a match.
      if (!text.includes(q) || !n.parentElement?.checkVisibility()) continue
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) {
        const r = new Range()
        r.setStart(n, i)
        r.setEnd(n, i + q.length)
        list.push(r)
      }
    }
    ranges.current = list
    setHits(list.length)
    // Start at the newest match.
    setAt((a) => (list.length === 0 ? null : a === null || a >= list.length ? list.length - 1 : a))
    CSS.highlights.set('find', new Highlight(...list))
    return () => void CSS.highlights.delete('find')
  }, [query, rows, visible])
  useEffect(() => {
    const r = at === null ? undefined : ranges.current[at]
    if (!r) return
    CSS.highlights.set('find-current', new Highlight(r))
    stick.current = false
    r.startContainer.parentElement?.scrollIntoView({ block: 'center' })
    return () => void CSS.highlights.delete('find-current')
  }, [at, hits])
  const step = (d: number) => hits > 0 && setAt((a) => (((a ?? 0) + d) % hits + hits) % hits)

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
      // If the transcript never shows it (the agent dropped it), stop pretending after a while. A queued one waits for the step to end, which can take minutes: see the effect below.
      if (!p.queued) setTimeout(() => setSent((cur) => cur.filter((x) => x.id !== p.id)), 20_000)
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
      const found = sel.getRangeAt(0)
      const reply = (found.startContainer instanceof Element ? found.startContainer : found.startContainer.parentElement)?.closest('.msg.assistant')
      if (!reply || !el.contains(reply)) return setPick(null)
      // A triple click on a paragraph ends the selection at the start of whatever follows, outside the reply: trim it back to the reply.
      // Words that really reach into another message are not offered.
      let range = found
      if (!reply.contains(found.endContainer)) {
        range = found.cloneRange()
        range.setEnd(reply, reply.childNodes.length)
        if (range.toString().trim() !== sel.toString().trim()) return setPick(null)
      }
      const text = range.toString().trim()
      if (!text) return setPick(null)
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
      data-agent={agentId}
      ref={chatEl}
      hidden={!visible}
      // Focusable, so a click anywhere in the conversation puts the keyboard here and Esc works without clicking the box first.
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') (e.preventDefault(), setQuery((q) => q ?? ''))
        // Esc interrupts the agent from anywhere in the conversation, unless a menu or dialog is open: that takes the Esc to close itself.
        else if (e.key === 'Escape' && busy && !stopping && !e.nativeEvent.isComposing && !document.querySelector('[role="menu"], [role="dialog"], dialog[open]')) (setStopping(true), void window.aw.chatInterrupt(agentId))
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
            onKeyDown={(e) => {
              if (e.key === 'Escape') (setQuery(null), e.stopPropagation())
              // Enter goes to the previous (older) match, Shift+Enter to the next, as the buttons do.
              else if (e.key === 'Enter') (e.preventDefault(), step(e.shiftKey ? 1 : -1))
            }}
            placeholder="Search this conversation…"
            aria-label="Search this conversation"
            autoFocus
          />
          <span className="chat-count" aria-live="polite">{!searching ? '' : hits === 0 ? 'No matches' : `${(at ?? 0) + 1} of ${hits}`}</span>
          <button className="chat-step" onClick={() => step(-1)} disabled={hits === 0} aria-label="Previous match" title="Previous (older) match: Enter">↑</button>
          <button className="chat-step" onClick={() => step(1)} disabled={hits === 0} aria-label="Next match" title="Next (newer) match: Shift+Enter">↓</button>
          <button onClick={() => setQuery(null)}>Close</button>
        </div>
      )}
      <ChatMenu agentId={agentId} markdown={() => toMarkdown(allRows, agentName)} onSearch={() => setQuery('')} />
      <div className="chat-log" ref={log} onScroll={onScroll} role="log" aria-label={`Conversation with ${agentName}`} aria-live="polite">
        {rows.length === 0 && (
          <p className="chat-empty">
            { asleep ? `${agentName} is asleep. Wake them to continue this conversation.` : `Say something to ${agentName}. The conversation appears here as it happens.`}
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
      {!asleep && (
        <div className="statusrow">
          <ProcBar agentId={agentId} />
          <CrewLine agentId={agentId} managerName={agentName} waiting={waitingSubagents} />
        </div>
      )}
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
    case 'user': {
      const mail = parseAgentMail(r.text)
      if (mail) return <AgentMailCard {...mail} />
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
          {r.pending && <span className="msg-meta">{r.queued ? 'Queued: sends when the agent finishes its current step' : 'Sending…'}</span>}
        </div>
      )
    }
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
    case 'delegation':
      return <Delegation agentId={agentId} calls={r.calls} />
    case 'report':
      return <SubagentReport agentId={agentId} subagentId={r.agentId} body={r.body} />
    case 'tool':
      return <ToolCard run={r.run} working={busy} onImage={onImage} />
    case 'note':
      return r.detail ? <SummaryNote text={r.text} detail={r.detail} label={r.detailLabel} /> : <div className="msg note">{r.text}</div>
  }
}

/** What a subagent handed back when it finished, as the same kind of card as a message from another agent, named after its task. */
function SubagentReport({ agentId, subagentId, body }: { agentId: string; subagentId: string; body: string }) {
  const [name, setName] = useState('subagent')
  useEffect(() => {
    let alive = true
    void window.aw.subagents(agentId).then((l) => {
      const s = l.find((x) => x.agentId === subagentId)
      if (alive && s) setName(`${s.type} · ${s.description}`)
    }, () => {})
    return () => void (alive = false)
  }, [agentId, subagentId])
  return <AgentMailCard from={name} body={body} expectsReply={false} label="Report from" tag="Report" />
}

/** What another agent sent: a card of its own, cut to two lines until asked for, so it is never mistaken for something you typed. */
function AgentMailCard({ from, body, expectsReply, label = 'From agent', tag }: { from: string; body: string; expectsReply: boolean; label?: string; tag?: string }) {
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
    <article className={`mail ${open ? 'open' : 'folded'}`} aria-label={`Message from agent ${from}`}>
      <header className="mail-head">
        <svg className="mail-env" viewBox="0 0 14 10" aria-hidden="true">
          <rect width="14" height="10" fill="currentColor" />
          <path fill="var(--ink)" d="M0 0h14v1H0zM0 9h14v1H0zM0 0h1v10H0zM13 0h1v10h-1zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h3v1H5zM8 5h1v1H8zM9 4h1v1H9zM10 3h1v1h-1zM11 2h1v1h-1zM12 1h1v1h-1z" />
        </svg>
        <span className="mail-from">
          <span className="mail-lbl">{label}</span> “{from}”
        </span>
        <span className={`mail-tag ${expectsReply ? 'ask' : ''}`}>{tag ?? (expectsReply ? 'Asks for a reply' : 'Reply')}</span>
      </header>
      <div ref={box} className="mail-body">
        {body.split(/(`[^`]+`)/).map((part, i) => (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part))}
      </div>
      {(long || open) && (
        <footer className="mail-foot">
          {open && expectsReply && <span className="mail-route">reply → send_message to “{from}”</span>}
          <button aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{open ? 'Show less' : 'Read more'}</span>
            <svg viewBox="0 0 9 6" aria-hidden="true">
              <path d="M0 0h2v1h1v1h1v1h1V2h1V1h1V0h2v1H8v1H7v1H6v1H5v1H4V5H3V4H2V3H1V2H0z" />
            </svg>
          </button>
        </footer>
      )}
    </article>
  )
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

/** The summary /compact leaves behind is for the model, and what a hook said is long, so both sit behind a button. */
function SummaryNote({ text, detail, label = 'summary' }: { text: string; detail: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="msg note summary">
      <span>{text}</span>
      <button className="clamp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? `Hide ${label}` : `Show ${label}`}
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
  // Esc closes the open list of completions; it stays closed until the words before the caret change.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [attached, setAttached] = useState<Attachment[]>([])
  // The attached picture being looked at full size, where it can also be edited.
  const [viewing, setViewing] = useState<string | null>(null)
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
  // Every change to the message goes through `edit`, so undo and redo see completions, recalled messages and pastes too.
  const undo = useRef<UndoStack>(null!)
  undo.current ??= new UndoStack({ text, caret: text.length })
  const edit = (next: string, kind: 'type' | 'edit' = 'edit', caret = next.length) => {
    undo.current.record({ text: next, caret }, kind, Date.now())
    setText(next)
    setCaret(caret)
  }
  const restore = (s: Snap | null) => {
    if (!s) return
    setText(s.text)
    setCaret(s.caret)
    requestAnimationFrame(() => box.current?.setSelectionRange(s.caret, s.caret))
  }
  const step = (redo: boolean) => restore(redo ? undo.current.redo() : undo.current.undo())
  // The Edit menu and the right-click menu ask the box to undo too; they get the same history.
  useEffect(() => {
    const el = box.current
    const on = (e: Event) => {
      const t = (e as InputEvent).inputType
      if (t !== 'historyUndo' && t !== 'historyRedo') return
      e.preventDefault()
      step(t === 'historyRedo')
    }
    el?.addEventListener('beforeinput', on)
    return () => el?.removeEventListener('beforeinput', on)
  })
  useEffect(() => window.aw.onComposerPrefill((id, t) => id === agentId && (edit(t), box.current?.focus())), [agentId])
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
    if (dismissed === before) return []
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
  }, [slash?.[1], mention?.[1], commands, files, folders, text, end, dismissed, before])
  const apply = (s: Suggestion) => {
    const pos = s.from + s.insert.length
    edit(text.slice(0, s.from) + s.insert + text.slice(s.to), 'edit', pos)
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
      undo.current.reset({ text: '', caret: 0 })
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
      {(() => {
        const a = attached.find((x) => x.id === viewing)
        if (!a?.preview) return null
        // An edited picture is saved as a new file and replaces the attached one, so the agent reads the marked-up version.
        const save = async (png: Blob) => {
          const stem = a.name.replace(/\.[^.]+$/, '') || 'picture'
          const path = await window.aw.saveAttachment(agentId, `${stem}.png`, await png.arrayBuffer(), 'image/png')
          URL.revokeObjectURL(a.preview!)
          setAttached((cur) => cur.map((x) => (x.id === a.id ? { ...x, path, name: `${stem}.png`, preview: URL.createObjectURL(png) } : x)))
        }
        return <AttachmentViewer src={a.preview} name={a.name} onSave={save} onClose={() => setViewing(null)} />
      })()}
      {attached.length > 0 && (
        <ul className="attached" aria-label="Attached files">
          {attached.map((a) => (
            <li key={a.id} className={a.context ? 'chip-context' : undefined} title={a.context?.text}>
              {a.context && <span className="chip-from">Preview</span>}
              {a.preview ? (
                <button className="chip-img" onClick={() => setViewing(a.id)} aria-label={`Preview ${a.name}`}>
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
            {highlight(text).flatMap((p, i) =>
              p.kind !== 'plain' ? [<mark key={i} className={`tok-${p.kind}`}>{p.text}</mark>] : shell ? [p.text] : markdownSpans(p.text).map((m, j) => (m.kind === 'plain' ? m.text : <span key={`${i}-${j}`} className={`md-${m.kind}`}>{m.text}</span>))
            )}
            {'\n'}
          </div>
        <textarea
          ref={box}
          onScroll={(e) => mirror.current && (mirror.current.scrollTop = e.currentTarget.scrollTop)}
          value={text}
          rows={1}
          placeholder={blocked ? `${agentName} is waiting for you above` : busy ? `${agentName} is working… your message goes in next` : `Message ${agentName}  ·  / commands and skills  ·  @ files`}
          aria-label={`Message ${agentName}`}
          onChange={(e) => {
            search.current = null
            const t = (e.nativeEvent as InputEvent).inputType ?? ''
            edit(e.target.value, /^(insertFromPaste|insertFromDrop|deleteByCut)/.test(t) ? 'edit' : 'type', e.target.selectionStart)
          }}
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
            // With the list of completions open, Esc closes it; the next Esc is the one that stops the agent.
            if (e.key === 'Escape' && suggestions.length > 0) return void (e.preventDefault(), e.stopPropagation(), setDismissed(before))
            const key = e.key.toLowerCase()
            if ((e.metaKey || e.ctrlKey) && !e.altKey && (key === 'z' || (key === 'y' && e.ctrlKey))) {
              e.preventDefault()
              step(key === 'y' || e.shiftKey)
              return
            }
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
            } else if (e.key === 'Tab' && e.shiftKey) (e.preventDefault(), void window.aw.chatCycleMode(agentId).catch((err) => onError(errText(err))))
            else if (e.key === 'r' && e.ctrlKey && sent.current.length) {
              e.preventDefault()
              search.current ??= text.trim().toLowerCase()
              const at = sent.current.findIndex((m, i) => i > recall.current && m.toLowerCase().includes(search.current!))
              if (at >= 0) (edit(sent.current[at]!), (recall.current = at))
            } else if (e.key === 'ArrowUp' && !text && sent.current.length) {
              e.preventDefault()
              recall.current = Math.min(sent.current.length - 1, recall.current + 1)
              edit(sent.current[recall.current]!)
            } else if (e.key === 'ArrowDown' && recall.current >= 0 && text === sent.current[recall.current]) {
              e.preventDefault()
              recall.current -= 1
              edit(recall.current >= 0 ? sent.current[recall.current]! : '')
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
