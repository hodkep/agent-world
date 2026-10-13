import { unwrapPasted } from '../../shared/pasted'
import { parseAgentMail } from '../../shared/mail'
import { parseHandoff } from '../../shared/handoff'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { ChatItem, HookInfo } from '../../shared/chat'
import type { Activity, ProcInfo } from '../../shared/types'
import { PICKABLE_MODES, cssColor, modeInfo } from '../../shared/modes'
import { type NeedActions, NeedPanel, type Need, needTitle } from '../panel/InputDialog'
import { type Row, type Sent, highlight, markdownSpans, norm, rowText, spanLabel, toMarkdown, toRows } from './format'
import { QuoteMark } from './QuoteMark'
import { UndoStack, type Snap } from './undo'
import { AgentIdContext } from '../files/context'
import { EventChips } from './EventChips'
import { fromView, lastJump, neighbour, place, show } from './userJump'
import { back, fresh, newer, older, onFirstLine, onLastLine, type Recall } from './historyNav'
import { pickedMessage, type ViewInfo } from '../panel/picker'
import { Lightbox, Picture } from './Images'
import { AttachmentViewer } from './ImageEditor'
import { Markdown } from './markdown'
import { UserText } from './Mentions'
import { CrewLine } from './Crew'
import { Delegation } from './Delegation'
import type { SubagentInfo } from '../../shared/chat'
import type { PictureSet } from './gallery'
import { sendMessageCard } from './subagentMessage'
import { StepGroupView } from './StepGroupView'
import { type StepGroup, groupSteps } from './stepGroups'
import { type ToolRun, ToolCard } from './ToolCard'
import { WatchLine } from './WatchCards'
import { type AgentActions, type AgentInfo, ModelChip, MoreMenu, UsageRing } from './AgentControls'
import { OutlineIcon } from '../panel/IconButton'
import { PixelIcon } from './PixelIcon'
import { LibrarySlips, useLibraryUses } from './LibrarySlips'
import { hint, keysOf } from '../shortcuts'
import { placeInline, slipsFor, startsBefore, type Slip } from './slips'
import { HelpCard } from './HelpCard'
import type { UsageLimits } from '../../shared/usage'

/** How long the agent is shown working on the strength of a sent message alone, if nothing confirms the turn. */
const EAGER_MS = 8000
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
  jump,
  info,
  actions,
  limits,
  waitingSubagents,
  outgoing,
  onWake,
  onTerminal
}: {
  agentId: string
  agentName: string
  /** Subagents waiting on you (a permission request), by id. */
  waitingSubagents?: Set<string>
  /** Work this agent handed to others, to show in the conversation. */
  outgoing?: Extract<ChatItem, { kind: 'handoff-out' }>[]
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
  /** Open the chat at a message (a todo points at the one it was made or finished in); `n` changes each time it is asked. */
  jump?: { itemId: string; excerpt: string; n: number } | null
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
  // The pictures of one message, opened on one of them, to step through.
  const [gallery, setGallery] = useState<PictureSet | null>(null)
  const showPicture = (src: string, set?: PictureSet) => (set ? setGallery(set) : setZoomed(src))
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [away, setAway] = useState(false)
  const session = useRef('')
  // Claude reports that a turn began a moment after the message is sent, and sometimes late. Until it does, an agent that was free
  // (idle, waiting, or one that has not yet reported anything) is shown working from the moment of sending, and not otherwise (a slash command may start no turn, so it does not count).
  const [eagerAt, setEagerAt] = useState(0)
  const realBusy = BUSY.includes(activity)
  const busy = realBusy || (eagerAt > 0 && (activity === 'idle' || activity === 'waiting' || activity === 'asleep'))
  useEffect(() => {
    if (!eagerAt) return
    if (realBusy) {
      console.debug(`[aw] ${agentName} reported working ${Date.now() - eagerAt} ms after the message was sent`)
      return setEagerAt(0)
    }
    const t = setTimeout(() => setEagerAt(0), EAGER_MS)
    return () => clearTimeout(t)
  }, [eagerAt, realBusy, agentName])
  // Once the agent is free, a queued message that the transcript still does not show was dropped.
  useEffect(() => {
    if (busy) return
    const t = setTimeout(() => setSent((cur) => cur.filter((x) => x.at > Date.now() - 20_000)), 20_000)
    return () => clearTimeout(t)
  }, [busy, sent.length])
  const [stopping, setStopping] = useState(false)
  const [needProgress, setNeedProgress] = useState('')
  // A card can be closed while the agent keeps waiting; a strip brings it back, and a different ask shows its card again.
  const [closedNeed, setClosedNeed] = useState<string | null>(null)
  const needKey = need ? JSON.stringify(need) : null
  const needClosed = needKey !== null && closedNeed === needKey
  const closeNeed = () => setClosedNeed(needKey)
  // How long this turn has been going, counted live: from your last message, or from when this view saw the agent start
  // if it started by itself (a subagent report, a queued message).
  const [now, setNow] = useState(() => Date.now())
  const busySince = useRef(0)
  const idleAt = useRef(0)
  useEffect(() => {
    if (!busy) return void (idleAt.current = Date.now(), (busySince.current = 0))
    busySince.current ||= Date.now()
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [busy])
  const lastUserAt = items.findLast((i) => i.kind === 'user')?.at ?? 0
  const turnStart = lastUserAt >= idleAt.current ? lastUserAt : busySince.current
  // Like Claude's terminal: a tool that is running shows its own time; thinking and the rest show the time since the message.
  const stepClock = useRef({ key: '', at: 0 })
  const stepKey = `${activity}|${detail ?? ''}`
  if (stepClock.current.key !== stepKey) stepClock.current = { key: stepKey, at: Date.now() }
  const onStep = busy && ['running', 'implementing', 'researching', 'delegating'].includes(activity)
  const timeFrom = onStep ? Math.max(stepClock.current.at, turnStart) : turnStart
  const turnSec = busy && timeFrom ? Math.max(0, Math.floor((now - timeFrom) / 1000)) : 0
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

  // What this agent handed to others is not in its conversation file: it joins the conversation where it was sent.
  const merged = useMemo(() => {
    if (!outgoing?.length) return items
    const out = [...items]
    for (const o of [...outgoing].sort((a, b) => a.at - b.at)) {
      let at = out.length
      while (at > 0 && out[at - 1]!.at > o.at && out[at - 1]!.at > 0) at--
      out.splice(at, 0, o)
    }
    return out
  }, [items, outgoing])
  const allRows = useMemo(() => toRows(merged, sent), [merged, sent])
  // What the library did for this agent, shown beside the message it answered: pointed at, read, and the text it started with.
  const lib = useLibraryUses(agentId)
  const slipsByRow = useMemo(() => {
    const users = allRows.filter((r) => r.kind === 'user' && !r.pending && !parseAgentMail(r.text))
    const ats = users.map((r) => (r.kind === 'user' ? (r.at ?? 0) : 0))
    const starts = startsBefore(lib.uses, ats)
    const told = (launch?: number) => lib.uses.filter((x) => x.how === 'delivered' && x.launch === launch).length
    // A situation the agent met mid-run is shown beside the tool call that showed it; the message keeps what it pointed at itself.
    const inline = new Map<string, Slip[]>()
    const byUser = new Map(users.map((r, k) => {
      const from = ats[k]!
      const to = ats[k + 1] ?? Infinity
      const tools = allRows.flatMap((x) => (x.kind === 'tool' && x.run.at !== undefined && x.run.at >= from && x.run.at < to ? [{ id: x.id, at: x.run.at }] : []))
      const placed = placeInline(tools, slipsFor(lib.uses, from, to))
      for (const [id, v] of placed.inline) inline.set(id, v)
      return [r.id, { slips: placed.rest, starts: starts.get(k) ?? [], told: told(starts.get(k)?.[0]?.launch) }]
    }))
    return { byUser, inline }
  }, [allRows, lib.uses])
  // After a rewind Claude writes nothing until the next message, so the rewound messages are hidden here until it does.
  // A /btw side question is answered in Claude's own overlay; it shows here until dismissed and is not part of the conversation.
  const [btw, setBtw] = useState<{ question: string; answer: string | null } | null>(null)
  useEffect(() => window.aw.onBtw((id, b) => id === agentId && setBtw(b)), [agentId])
  const [cut, setCut] = useState<string | null>(null)
  // After an Esc with nothing after your last message Claude takes it back: it is hidden here, whether it is still "Sending…" or already saved, until you send again.
  const takenBack = useRef(0)
  // Once you send again only what was saved before that stays hidden, so the same words sent again show.
  const [gone, setGone] = useState<{ text: string; until: number } | null>(null)
  useEffect(
    () =>
      window.aw.onComposerPrefill((id, t) => {
        if (id !== agentId) return
        if (Date.now() - takenBack.current < 5000) return setGone({ text: norm(t), until: Infinity })
        const hit = [...allRows].reverse().find((r) => r.kind === 'user' && !r.pending && r.text.includes(t.slice(0, 40)))
        if (hit) setCut(hit.id)
      }),
    [agentId, allRows]
  )
  const visible_ = useMemo(() => {
    const at = cut ? allRows.findIndex((r) => r.id === cut) : -1
    const rest = at < 0 ? allRows : allRows.filter((r, i) => i < at || ('pending' in r && r.pending))
    return gone ? rest.filter((r) => !(r.kind === 'user' && norm(r.text) === gone.text && (r.pending ? gone.until === Infinity : (r.at ?? 0) < gone.until))) : rest
  }, [allRows, cut, gone])
  // Searching keeps the whole conversation in place and marks the matches in it; it does not cut the rows down.
  const found = visible_
  const searching = !!query?.trim()
  // Long conversations render only the latest rows; older ones load on request so the view stays quick.
  const [shown, setShown] = useState(WINDOW)
  useEffect(() => setShown(WINDOW), [agentId])
  const rows = useMemo(() => (!searching && found.length > shown ? found.slice(-shown) : found), [found, shown, searching])
  // A todo asks for a message: open the chat at it and flash it, or, when it is gone (the conversation was cleared), show what it said.
  const [flash, setFlash] = useState<string | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  useEffect(() => {
    if (!jump) return
    // A task made from a message you sent points at it by its words until the transcript has it.
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    const words = norm(jump.excerpt).slice(0, 60)
    const at = found.findIndex((r) => (jump.itemId ? r.id === jump.itemId : r.kind === 'user' && !!words && norm(r.text).startsWith(words)))
    setLost(null)
    if (at < 0) return setLost(jump.excerpt || 'That message is no longer in this conversation.')
    stick.current = false
    setShown((n) => Math.max(n, found.length - at + 5))
    setFlash(found[at]!.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n])
  useEffect(() => {
    if (!flash) return
    const el = log.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(flash)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center' })
    el.classList.add('flash')
    const t = setTimeout(() => (el.classList.remove('flash'), setFlash(null)), 2400)
    return () => clearTimeout(t)
  }, [flash, rows])

  // Loading earlier messages must not move what is being read: the browser does not hold the view at the very top, so the first message in view is put back where it was.
  const reading = useRef<{ el: HTMLElement; top: number } | null>(null)
  const showEarlier = () => {
    const l = log.current
    const top = l?.getBoundingClientRect().top ?? 0
    const el = l && [...l.querySelectorAll<HTMLElement>('.msg')].find((m) => m.getBoundingClientRect().bottom > top)
    reading.current = el ? { el, top: el.getBoundingClientRect().top - top } : null
    setShown((n) => n + WINDOW)
  }
  useLayoutEffect(() => {
    const l = log.current
    const r = reading.current
    reading.current = null
    if (l && r?.el.isConnected) l.scrollTop += r.el.getBoundingClientRect().top - l.getBoundingClientRect().top - r.top
  }, [shown])

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
      setGone((g) => g && { ...g, until: Date.now() })
      const p = { id: `pending-${Date.now()}`, text: text.trim(), at: Date.now(), queued: busy }
      // /clear empties the conversation at once (the main process does the same on its side); a busy agent only queues it.
      if (/^\/clear$/i.test(p.text) && !p.queued) {
        setItems([])
        setSent([])
      } else setSent((cur) => [...cur, p])
      stick.current = true
      if (!p.queued && !p.text.startsWith('/')) setEagerAt(Date.now())
      try {
        await window.aw.chatSend(agentId, text)
      } catch (err) {
        setEagerAt(0)
        setSent((cur) => cur.filter((x) => x.id !== p.id))
        // A /clear that did not go through leaves the conversation as it was.
        void window.aw.chatGet(agentId).then((c) => setItems(c.items))
        setError(errText(err))
        throw err
      }
      // If the transcript never shows it (the agent dropped it), stop pretending after a while. A queued one waits for the step to end, which can take minutes: see the effect below.
      if (!p.queued) setTimeout(() => setSent((cur) => cur.filter((x) => x.id !== p.id)), 20_000)
    },
    [agentId, busy]
  )

  // Words selected in one of the agent's replies, or in what its tools and commands printed, offer "Ask": they go into the message box as a quote.
  const chatEl = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ text: string; x: number; y: number; nx: number } | null>(null)
  // "Ask" opens a small box where the button was: what is typed there becomes the words under the quote.
  const [asking, setAsking] = useState<string | null>(null)
  const askingRef = useRef(false)
  askingRef.current = asking !== null
  useEffect(() => {
    const look = () => {
      // Focusing the little box would otherwise read as the selection going away.
      if (askingRef.current) return
      const sel = window.getSelection()
      const el = log.current
      const root = chatEl.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el || !root) return setPick(null)
      const found = sel.getRangeAt(0)
      const reply = (found.startContainer instanceof Element ? found.startContainer : found.startContainer.parentElement)?.closest('.msg.assistant, .msg.note, .msg.shell, .tc')
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
  const quote = (note = '') => {
    if (!pick) return
    chatEl.current?.dispatchEvent(new CustomEvent('aw-quote', { detail: { text: pick.text, note: note.trim() } }))
    window.getSelection()?.removeAllRanges()
    setAsking(null)
    setPick(null)
  }
  const cancelAsk = () => (setAsking(null), setPick(null))
  // A click anywhere else puts the box away.
  useEffect(() => {
    if (asking === null) return
    const away = (e: MouseEvent) => !(e.target as Element | null)?.closest?.('.ask-selection') && cancelAsk()
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [asking === null])

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
        // Alt+↑ / Alt+↓ jump between the messages you sent, from the one last jumped to or else from what is on screen.
        else if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && log.current) {
          e.preventDefault()
          const dir = e.key === 'ArrowUp' ? -1 : 1
          const here = lastJump(log.current)
          const to = here ? neighbour(log.current, here, dir) : fromView(log.current, dir)
          if (to) show(to)
        }
        // With a question open the first Esc closes its card (the agent keeps waiting) and the next one stops the agent, as with the list of completions.
        else if (e.key === 'Escape' && need && !needClosed && !e.nativeEvent.isComposing && !document.querySelector('[role="menu"], [role="dialog"], dialog[open]')) (e.preventDefault(), closeNeed())
        // Esc interrupts the agent from anywhere in the conversation, unless a menu or dialog is open: that takes the Esc to close itself.
        else if (e.key === 'Escape' && busy && !stopping && !e.nativeEvent.isComposing && !document.querySelector('[role="menu"], [role="dialog"], dialog[open]')) {
          setStopping(true)
          // With nothing after your last message yet, Claude takes it back: it leaves the conversation and returns to the box with what went with it.
          const last = allRows.at(-1)
          const unsent = last?.kind === 'user' && !parseAgentMail(last.text) ? last.text : undefined
          if (unsent !== undefined) (takenBack.current = Date.now(), window.dispatchEvent(new CustomEvent('aw:unsend', { detail: { agentId } })))
          void window.aw.chatInterrupt(agentId, unsent)
        }
      }}
    >
      {pick && (
        <div className={`ask-selection ${asking === null ? '' : 'open'}`} style={{ left: pick.x, top: pick.y, ['--nx' as string]: `${pick.nx}px` }}>
          {asking === null ? (
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => setAsking('')} title="Ask about the selected words">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 3h12v8H8l-3.5 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              Ask {agentName}
            </button>
          ) : (
            <form onSubmit={(e) => (e.preventDefault(), quote(asking))}>
              <input
                autoFocus
                aria-label={`Ask ${agentName} about the selection`}
                placeholder={`Ask ${agentName}…`}
                value={asking}
                onChange={(e) => setAsking(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), cancelAsk())}
              />
              <button type="submit" title="Add the quote and your words to the message box, to edit before sending">Add</button>
            </form>
          )}
        </div>
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
        {lost !== null && (
          <section className="msg note td-lost" role="note" aria-label="Message not found">
            <b>That message is no longer in this chat.</b> It said: “{lost}”
            <button onClick={() => setLost(null)} aria-label="Dismiss">×</button>
          </section>
        )}
        {rows.length < found.length && (
          <button className="earlier" onClick={showEarlier}>
            Show earlier ({found.length - rows.length} more)
          </button>
        )}
        {(searching ? rows : groupSteps(rows) as (Row | StepGroup)[]).map((r, at, list) => {
          const here = r.kind === 'group' ? r.steps.flatMap((x) => slipsByRow.inline.get(x.id) ?? []) : slipsByRow.inline.get(r.id) ?? []
          // A step with a note beside it gets the same wrapper as a message does: a margin for the note in a wide chat, the note under it in a narrow one.
          const withNote = (el: ReactElement) => (here.length ? <div key={r.id} className="turn step"><div className="turn-row">{el}</div><LibrarySlips slips={here} starts={[]} told={0} items={lib.items} /></div> : el)
          if (r.kind === 'group') return withNote(<StepGroupView key={r.id} group={r} active={busy && list.slice(at + 1).every((x) => x.kind === 'user' && x.pending)} onImage={showPicture} />)
          const lb = slipsByRow.byUser.get(r.id)
          const row = <RowView key={r.id} row={r} agentId={agentId} agentName={agentName} busy={busy} asleep={asleep} onImage={showPicture} onRewind={(text) => void window.aw.rewindTo(agentId, text).catch((err) => setError(errText(err)))} />
          if (!lb || (!lb.starts.length && !lb.slips.length)) return withNote(row)
          // A message with notes gets a wrapper that adds nothing to a narrow chat and gives a wide one a margin for them; the others are left as they were (the chat's selectors count on it).
          return (
            <div key={r.id} className="turn">
              {lb.starts.length > 0 && <LibrarySlips slips={[]} starts={lb.starts} told={lb.told} items={lib.items} />}
              {row}
              {lb.slips.length > 0 && <LibrarySlips slips={lb.slips} starts={[]} told={0} items={lib.items} />}
            </div>
          )
        })}
        {busy && (
          <div className="live" role="status">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {stopping ? `Stopping ${agentName}…` : `${agentName} ${VERB[realBusy ? activity : 'thinking']}`}
            {!stopping && detail ? <span className="live-detail"> · {detail}</span> : null}
            {turnSec >= 1 && <span className="live-time" aria-hidden="true">{spanLabel(turnSec)}</span>}
          </div>
        )}
      </div>
      {need && needClosed && (
        <div className="chat-banner" role="status">
          <span>{agentName} is waiting for you · {needTitle(need).toLowerCase()}</span>
          <button onClick={() => setClosedNeed(null)}>Show</button>
        </div>
      )}
      {need && !needClosed && (
        <section className={`inline-need dialog kind-${need.kind}`} aria-label={`${agentName} is waiting for you`}>
          <header className="dialog-bar">
            <span className="blip" aria-hidden="true" />
            <b className="inline-who">{agentName}</b>
            <span className="dialog-kind">{needTitle(need)}</span>
            {need.kind === 'question' && needProgress && <span className="dialog-count">{needProgress}</span>}
            {moreNeeds > 0 && <span className="dialog-more">+{moreNeeds} waiting</span>}
            <button className="dialog-x" onClick={closeNeed} aria-label="Close (Esc)" title="Close (Esc); the agent keeps waiting" />
          </header>
          <NeedPanel need={need} actions={needActions} onFinishInTerminal={onTerminal} onProgress={setNeedProgress} />
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
          <WatchLine
            runs={rows.flatMap((r) => (r.kind === 'tool' ? [r.run] : []))}
            agentId={agentId}
            agentName={agentName}
            jump={(key) => log.current?.querySelector<HTMLElement>(`[data-watch="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          />
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
        onImage={showPicture}
        latest={
          away ? (
            <button className="jump" onClick={() => ((log.current!.scrollTop = log.current!.scrollHeight), (stick.current = true), setAway(false))}>
              Latest
            </button>
          ) : null
        }
      />
      {zoomed !== null && <Lightbox src={zoomed} onClose={() => setZoomed(null)} />}
      {gallery !== null && <Lightbox src={gallery.pictures[gallery.index]!.src} set={gallery} onClose={() => setGallery(null)} />}
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
          <button role="menuitem" title={hint('chat-find')} onClick={() => (setOpen(false), onSearch())}>
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

/** Two small arrows beside one of your messages: to the message you sent before it, and the one after. Shown on hover or focus. */
function JumpButtons() {
  const [at, setAt] = useState({ at: 0, of: 0 })
  const root = useRef<HTMLSpanElement>(null)
  // Where this message is among yours is read when the pointer or focus reaches the message, so it is right whatever came since.
  useEffect(() => {
    const msg = root.current?.closest<HTMLElement>('[data-user-msg]')
    if (!msg) return
    const look = () => {
      const log = msg.closest('.chat-log')
      if (log) setAt(place(log, msg))
    }
    msg.addEventListener('mouseenter', look)
    msg.addEventListener('focusin', look)
    return () => {
      msg.removeEventListener('mouseenter', look)
      msg.removeEventListener('focusin', look)
    }
  }, [])
  const go = (dir: 1 | -1) => {
    const msg = root.current?.closest<HTMLElement>('[data-user-msg]')
    const log = msg?.closest('.chat-log')
    const to = msg && log ? neighbour(log, msg, dir) : null
    if (to) show(to)
  }
  return (
    <span className="msg-jump" ref={root}>
      <button onClick={() => go(-1)} disabled={at.at <= 1} aria-label="Previous message you sent" title={`Previous message you sent${at.of ? ` (${at.at} of ${at.of})` : ''} · Alt+↑`}>
        ▲
      </button>
      <button onClick={() => go(1)} disabled={at.at === 0 || at.at >= at.of} aria-label="Next message you sent" title={`Next message you sent${at.of ? ` (${at.at} of ${at.of})` : ''} · Alt+↓`}>
        ▼
      </button>
    </span>
  )
}

export function RowView({ row: r, agentId, agentName, busy, asleep, onImage, onRewind }: { row: Row; agentId: string; agentName: string; busy: boolean; asleep: boolean; onImage: (src: string, set?: PictureSet) => void; onRewind: (text: string) => void }) {
  switch (r.kind) {
    case 'user': {
      const mail = parseAgentMail(r.text)
      if (mail) return parseHandoff(mail.body) ? <HandoffCard who={mail.from} body={mail.body} /> : <AgentMailCard {...mail} />
      return (
        <div className={`msg user ${r.pending ? 'pending' : ''}`} data-user-msg data-row={r.id}>
          <JumpButtons />
          <Clamped>
            <UserText agentId={agentId} text={r.text} onImage={onImage} />
          </Clamped>
          {!r.pending && (
            <div className="user-acts">
              <Copy text={r.text} />
              {!busy && !asleep && (
                <button className="rewind-btn" onClick={() => onRewind(r.text.replace(/@"[^"]*"\s*/g, '').trim() || r.text)} title="Go back to before this message: restore the conversation, and the code too where the agent's program tracked changes">
                  Rewind
                </button>
              )}
            </div>
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
        <div className="msg assistant" data-row={r.id}>
          {r.hooks?.map((h, i) => <HookStrip key={i} hook={h} agentName={agentName} />)}
          <div className="who">
            {agentName}
            <Copy text={r.text} />
          </div>
          <Markdown text={r.text} agentId={agentId} />
          {r.took !== undefined && <div className="msg-meta">worked for {spanLabel(r.took)}</div>}
        </div>
      )
    case 'thinking':
      return (
        <div className="msg think">
          <span className="tc-dot" aria-hidden="true" /> {r.took ? `Thought for ${spanLabel(r.took)}` : 'Thought about it'}
        </div>
      )
    case 'delegation':
      return <Delegation agentId={agentId} calls={r.calls} />
    case 'report':
      return <SubagentReport agentId={agentId} subagentId={r.agentId} body={r.body} />
    case 'tool':
      return r.run.name === 'SendMessage' ? <SendMessageCard agentId={agentId} run={r.run} /> : <ToolCard run={r.run} working={busy} onImage={onImage} />
    case 'handoff-out':
      return <HandoffCard who={r.to} body={r.text} out status={r.status} />
    case 'events':
      return <EventChips chips={r.chips} />
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

/** The agent's own SendMessage call, as the sending side of a mail card: who it went to, what it said and what became of it. */
function SendMessageCard({ agentId, run }: { agentId: string; run: ToolRun }) {
  const [infos, setInfos] = useState<SubagentInfo[]>([])
  const answered = !!run.result
  useEffect(() => {
    let alive = true
    void window.aw.subagents(agentId).then((l) => alive && setInfos(l), () => {})
    return () => void (alive = false)
  }, [agentId, answered])
  const c = sendMessageCard(run.input, run.result, infos)
  return <AgentMailCard from={c.name} body={c.body} expectsReply={false} label={c.label} tag={c.tag} tone={c.tone} summary={c.summary} route={c.route} />
}

const HANDOFF = { review: 'Review', continue: 'Continue', answer: 'Answer' } as const

/** Work another agent handed over, as a card: what is asked, which branch, how to read it; the words it was given are behind a button. */
function HandoffCard({ who, body, out, status }: { who: string; body: string; out?: boolean; status?: 'queued' | 'delivered' | 'dropped' }) {
  const h = parseHandoff(body)!
  return (
    <article className={`mail handoff-card ${out ? 'out' : ''}`} aria-label={`Hand-off ${out ? 'to' : 'from'} agent ${who}`}>
      <header className="mail-head">
        <span className="mail-from">
          <span className="mail-lbl">Hand-off {out ? 'to' : 'from'}</span> “{who}”
        </span>
        <span className="mail-tag ask">{HANDOFF[h.kind]}</span>
        {status && <span className={`mail-tag ho-status ${status}`}>{status === 'queued' ? 'waiting its turn' : status === 'dropped' ? 'not delivered' : 'delivered'}</span>}
      </header>
      <dl className="ho-kv">
        <dt>Branch</dt>
        <dd><code>{h.branch}</code> from <code>{h.base}</code></dd>
        {h.read && (<><dt>Read with</dt><dd><code>{h.read}</code></dd></>)}
        {h.note && (<><dt>Note</dt><dd>{h.note}</dd></>)}
      </dl>
      <details className="ho-told">
        <summary>What it was told</summary>
        <pre>{body}</pre>
      </details>
    </article>
  )
}

/** What another agent sent: a card of its own, cut to two lines until asked for, so it is never mistaken for something you typed. */
function AgentMailCard({ from, body, expectsReply, label = 'From agent', tag, summary, tone, route }: { from: string; body: string; expectsReply: boolean; label?: string; tag?: string; /** A title over the words. */ summary?: string; tone?: 'go' | 'ok' | 'bad' | 'wait'; /** A line under the words, always shown. */ route?: string }) {
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
    <article className={`mail ${open ? 'open' : 'folded'}`} aria-label={label.startsWith('To ') ? `Message ${label.toLowerCase()} ${from}` : `Message from agent ${from}`}>
      <header className="mail-head">
        <svg className="mail-env" viewBox="0 0 14 10" aria-hidden="true">
          <rect width="14" height="10" fill="currentColor" />
          <path fill="var(--ink)" d="M0 0h14v1H0zM0 9h14v1H0zM0 0h1v10H0zM13 0h1v10h-1zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h3v1H5zM8 5h1v1H8zM9 4h1v1H9zM10 3h1v1h-1zM11 2h1v1h-1zM12 1h1v1h-1z" />
        </svg>
        <span className="mail-from">
          <span className="mail-lbl">{label}</span> “{from}”
        </span>
        <span className={`mail-tag ${expectsReply ? 'ask' : ''} ${tone ?? ''}`}>{tag ?? (expectsReply ? 'Asks for a reply' : 'Reply')}</span>
      </header>
      {summary && <p className="mail-sum">{summary}</p>}
      <div ref={box} className="mail-body">
        {body.split(/(`[^`]+`)/).map((part, i) => (part.length > 2 && part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part))}
      </div>
      {(long || open || route) && (
        <footer className="mail-foot">
          {route ? <span className="mail-route" title={route}>{route}</span> : open && expectsReply && <span className="mail-route">reply → send_message to “{from}”</span>}
          {(long || open) && (
            <button aria-expanded={open} onClick={() => setOpen(!open)}>
              <span>{open ? 'Show less' : 'Read more'}</span>
              <svg viewBox="0 0 9 6" aria-hidden="true">
                <path d="M0 0h2v1h1v1h1v1h1V2h1V1h1V0h2v1H8v1H7v1H6v1H5v1H4V5H3V4H2V3H1V2H0z" />
              </svg>
            </button>
          )}
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

/** What a hook told the agent just before this reply: a strip above the reply, with the findings a click away. */
function HookStrip({ hook, agentName }: { hook: HookInfo; agentName: string }) {
  const [open, setOpen] = useState(false)
  const count = hook.issues ?? (hook.findings.length || undefined)
  const verdict = count !== undefined ? `${count} issue${count === 1 ? '' : 's'}` : /\bno\b[^.]*\bissues?\b/i.test(hook.title) ? 'No issues' : ''
  return (
    <div className={`hook-strip ${open ? 'open' : ''}`}>
      <div className="hook-row">
        <OutlineIcon name="flag" />
        <span className="hook-sub">
          {agentName.charAt(0).toUpperCase() + agentName.slice(1)} replied after {hook.source ? <b>{hook.source}</b> : 'a'} {hook.source ? '· ' : ''}
          {hook.event} hook{verdict ? ` · ${verdict}` : ''}
        </span>
        <button className="hook-toggle" aria-expanded={open} aria-label={open ? 'Hide details' : 'Show details'} title={open ? 'Hide details' : 'Show details'} onClick={() => setOpen(!open)}>
          <OutlineIcon name="chevron" />
        </button>
      </div>
      {open && (
        <div className="hook-body">
          {hook.findings.length > 0 ? (
            hook.findings.map((f, i) => (
              <div key={i}>
                <span className="hook-ref">{f.ref}</span>
                <span className="hook-rule">{f.rule}</span>
                <span className="hook-text">{f.text}</span>
              </div>
            ))
          ) : (
            <div>
              <span className="hook-text">{hook.title}</span>
            </div>
          )}
        </div>
      )}
    </div>
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
  context?: { text: string; label: string; /** The screen size the page was seen at, for something picked in the Preview. */ view?: ViewInfo; /** Where it came from, as the chip says: Preview, Code. */ source?: string; /** Where to bring the code back to. */ jump?: { path: string; from: number; to: number } }
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
  onImage,
  latest
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
  /** The button that jumps to the newest message: it rides on the top edge of the box, wherever the box grows to. */
  latest?: React.ReactNode
}) {
  const [text, setText] = useState(() => drafts.get(agentId) ?? '')
  const [commands, setCommands] = useState<PaletteCommand[]>([])
  const [help, setHelp] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const [at, setAt] = useState(0)
  // Esc closes the open list of completions; it stays closed until the words before the caret change.
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [caret, setCaret] = useState(0)
  const [attached, setAttached] = useState<Attachment[]>([])
  // The attached picture being looked at full size, where it can also be edited.
  const [viewing, setViewing] = useState<string | null>(null)
  // Words quoted from a reply sit above the box as cards; they join the message as "> " lines when it is sent.
  const [quotes, setQuotes] = useState<{ text: string; note: string; open?: boolean }[]>([])
  const [over, setOver] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  // The box itself (or the asleep bar that stands in for it): quotes are heard from the conversation around it, whichever is showing.
  const root = useRef<HTMLDivElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const sent = useRef<string[]>([])
  // Walking back through the messages sent from this box with ↑ ↓; the draft being typed is kept and comes back.
  const walk = useRef<Recall>(fresh)
  const [walkAt, setWalkAt] = useState(-1)
  const setWalk = (r: Recall) => {
    walk.current = r
    setWalkAt(r.index)
  }
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
  // What the last message was made of, kept until the next one, so Esc before an answer can put all of it back: the words, the pictures and files, the quotes.
  const lastSent = useRef<{ value: string; attached: Attachment[]; quotes: typeof quotes } | null>(null)
  const unsentAt = useRef(0)
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<{ agentId: string }>).detail.agentId === agentId && (unsentAt.current = Date.now())
    window.addEventListener('aw:unsend', on)
    return () => window.removeEventListener('aw:unsend', on)
  }, [agentId])
  useEffect(
    () =>
      window.aw.onComposerPrefill((id, t) => {
        if (id !== agentId) return
        const mine = lastSent.current
        if (mine && Date.now() - unsentAt.current < 5000) {
          if (mine.value) sent.current.shift()
          edit(mine.value)
          setAttached(mine.attached)
          setQuotes(mine.quotes)
          lastSent.current = null
        } else edit(t)
        box.current?.focus()
      }),
    [agentId]
  )
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
    void window.aw.code.mentionFiles(agentId).then(setFiles, () => setFiles([]))
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
    const chat = root.current?.closest('.chat')
    if (!chat) return
    const on = (e: Event) => {
      const d = (e as CustomEvent<string | { text: string; note?: string }>).detail
      const words = String(typeof d === 'object' && d ? d.text : d ?? '').trim()
      if (!words) return
      setQuotes((q) => [...q, { text: words, note: (typeof d === 'object' && d?.note) || '' }])
      box.current?.focus()
    }
    chat.addEventListener('aw-quote', on)
    return () => chat.removeEventListener('aw-quote', on)
    // Heard again when the agent wakes: an asleep agent has no box, but what is quoted meanwhile waits for it.
  }, [asleep])

  // Something picked on the Preview page arrives as one chip (its picture, and the words that describe it) to send with a question about it.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; text: string; file: File | null; label?: string; view?: ViewInfo; source?: string; jump?: { path: string; from: number; to: number }; handled?: boolean }>).detail
      // The same agent can be open in the side panel and in a grid cell; only the first box takes it.
      if (d.agentId !== agentId || d.handled) return
      d.handled = true
      const context = { text: d.text, label: d.label ?? 'an element', source: d.source, jump: d.jump, view: d.view }
      if (d.file) void attach([d.file], context)
      // The same words twice would only say it twice.
      else setAttached((cur) => (cur.some((a) => a.context?.text === d.text) ? cur : [...cur, { id: `${Date.now()}-${cur.length}`, name: context.label, path: '', context }]))
      box.current?.focus()
    }
    window.addEventListener('aw-context', on)
    return () => window.removeEventListener('aw-context', on)
  }, [agentId, attach])

  // The Code view shows these chips too, and can take one off: it is told what is here and asked to remove by name.
  const chipsRef = useRef<Attachment[]>([])
  chipsRef.current = attached
  const tell = useCallback(() => {
    const chips = chipsRef.current.filter((a) => a.context).map((a) => ({ id: a.id, label: a.name, source: a.context!.source ?? 'Preview', jump: a.context!.jump }))
    window.dispatchEvent(new CustomEvent('aw-context-changed', { detail: { agentId, chips } }))
  }, [agentId])
  useEffect(tell, [attached, tell])
  useEffect(() => {
    const remove = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; id: string }>).detail
      if (d.agentId === agentId) setAttached((cur) => cur.filter((a) => a.id !== d.id))
    }
    const ask = (e: Event) => (e as CustomEvent<{ agentId: string }>).detail.agentId === agentId && tell()
    window.addEventListener('aw-context-remove', remove)
    window.addEventListener('aw-context-ask', ask)
    return () => {
      window.removeEventListener('aw-context-remove', remove)
      window.removeEventListener('aw-context-ask', ask)
    }
  }, [agentId, tell])

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
    const picked = pickedMessage(attached.filter((a) => a.context).map((a) => ({ text: `${a.context!.text}${a.path ? `\nPicture of it: @"${a.path}"` : ''}`, view: a.context!.view })))
    // Attached files come first so the message reads "look at these: …".
    // Each quote is followed by what was written about it.
    const asked = quotes.map((q) => [q.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n'), q.note.trim()].filter(Boolean).join('\n\n')).join('\n\n')
    const body = picked ? [mentions, picked, value].filter(Boolean).join('\n\n') : mentions ? `${mentions}${value ? `\n${value}` : ''}` : value
    const full = asked ? [asked, body].filter(Boolean).join('\n\n') : body
    // /help is a screen of the program's terminal that leaves nothing in the conversation, so the chat answers it itself (and sends nothing to the terminal).
    if (/^\/help$/i.test(value) && !mentions && !asked && !picked) {
      setHelp(true)
      setText('')
      undo.current.reset({ text: '', caret: 0 })
      return
    }
    try {
      await onSend(full)
      if (value) sent.current.unshift(value)
      setWalk(fresh)
      setText('')
      undo.current.reset({ text: '', caret: 0 })
      setQuotes([])
      for (const a of lastSent.current?.attached ?? []) if (a.preview) URL.revokeObjectURL(a.preview)
      lastSent.current = { value, attached, quotes }
      setAttached([])
    } catch {
      /* the error is shown above the composer; the text stays for another try */
    }
  }

  if (asleep)
    return (
      <div className="composer asleep" ref={root}>
        {latest}
        <span>
          {agentName} is asleep.
          {quotes.length > 0 && ` ${quotes.length} quote${quotes.length === 1 ? '' : 's'} waiting.`}
          {attached.some((a) => a.context) && ` ${attached.filter((a) => a.context).length} picked item${attached.filter((a) => a.context).length === 1 ? '' : 's'} waiting.`}
        </span>
        <button className="primary" onClick={onWake}>
          Wake {agentName}
        </button>
      </div>
    )

  return (
    <div
      ref={root}
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
      {latest}
      {help && <HelpCard commands={commands} onClose={() => setHelp(false)} onPick={(name) => { setHelp(false); setText(`/${name} `); requestAnimationFrame(() => box.current?.focus()) }} />}
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
              {a.context && <span className="chip-from">{a.context.source ?? 'Preview'}</span>}
              {a.context?.view && <span className="chip-view" title={`Seen at ${a.context.view.label} ${a.context.view.w}×${a.context.view.h}`}>{a.context.view.label}</span>}
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
              <button className="chip-x" aria-label={`Remove ${a.name}`} title="Take this off the message" onClick={() => setAttached((cur) => cur.filter((x) => x.id !== a.id))} />
            </li>
          ))}
        </ul>
      )}
      <div className="cbox">
        {quotes.length > 0 && (
          <ul className="quote-cards" aria-label="Quoted from the conversation">
            {quotes.map((q, i) => {
              const long = q.text.split('\n').length > 3 || q.text.length > 150
              const toggle = () => setQuotes((cur) => cur.map((x, j) => (j === i ? { ...x, open: !x.open } : x)))
              return (
                <li key={i} className="qa">
                  <div className="qa-label">
                    <QuoteMark />
                    Quote
                    <button className="chip-x" aria-label="Remove this quote" title="Take this quote off the message" onClick={() => setQuotes((cur) => cur.filter((_, j) => j !== i))} />
                  </div>
                  <blockquote className={`qa-q ${long && !q.open ? 'clamp' : ''}`} onClick={() => long && toggle()} title={long ? (q.open ? 'Fold' : 'Show all') : undefined}>
                    <span className="qt">{q.text}</span>
                  </blockquote>
                  {long && (
                    <button className="qa-more" onClick={toggle}>
                      {q.open ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  <textarea
                    className="qa-input"
                    rows={1}
                    value={q.note}
                    onChange={(e) => setQuotes((cur) => cur.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), box.current?.focus())
                    }}
                    placeholder="What about this?"
                    aria-label="What to do about this quote"
                  ></textarea>
                </li>
              )
            })}
          </ul>
        )}
        {walkAt >= 0 && (
          <div className="hist-hint" role="status">
            <b>↑ history {walkAt + 1} of {sent.current.length}</b>
            <span>your draft is kept</span>
            <span>↓ newer · Esc back to my draft</span>
          </div>
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
          title={`${keysOf('send')} sends · ${keysOf('newline')} new line · ${keysOf('history')} earlier messages · ${keysOf('search-sent')} search them`}
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
              const at = sent.current.findIndex((m, i) => i > walk.current.index && m.toLowerCase().includes(search.current!))
              if (at >= 0) (setWalk({ index: at, draft: walk.current.index < 0 ? text : walk.current.draft }), edit(sent.current[at]!))
            } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
              const el = e.currentTarget
              const step = e.key === 'ArrowUp' ? (onFirstLine(text, el.selectionStart) ? older(walk.current, sent.current, text) : null) : onLastLine(text, el.selectionEnd) ? newer(walk.current, sent.current) : null
              if (!step) return
              e.preventDefault()
              setWalk(step.recall)
              // Going back puts the caret at the start so ↑ goes on; coming forward puts it at the end so ↓ does.
              const caret = e.key === 'ArrowUp' ? 0 : step.text.length
              edit(step.text, 'edit', caret)
              requestAnimationFrame(() => box.current?.setSelectionRange(caret, caret))
            } else if (e.key === 'Escape' && walk.current.index >= 0) {
              // Esc while looking at an older message brings the draft back, before it is taken to mean "stop the agent".
              const r = back(walk.current)!
              e.preventDefault()
              e.stopPropagation()
              setWalk(r.recall)
              edit(r.text)
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
            title={`Permission mode: how much this agent may do without asking. ${keysOf('cycle-mode')} moves to the next one.`}
          >
            {switching ? 'Switching…' : modeInfo(mode).label}
          </button>
          {modeOpen && (
            <div className="pop-menu mode-menu" role="menu" aria-label="Permission mode">
              {(info?.modes?.filter((m) => !/bypass|skip/.test(m.id) || info.relaunch?.includes(m.id)) ?? PICKABLE_MODES).map((m) => (
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
            <button className="cb-icon cb-stop" onClick={() => (onStopping(true), onStop())} disabled={stopping} aria-label="Stop" title={`Interrupt (${keysOf('stop')})`}>
              <PixelIcon name="stop" />
            </button>
          ) : (
            <button className="cb-icon cb-send" onClick={() => void submit()} disabled={!text.trim() && attached.length === 0 && quotes.length === 0} aria-label="Send" title={`Send (${keysOf('send')}) · ${keysOf('newline')} new line · ${keysOf('cycle-mode')} changes mode`}>
              <PixelIcon name="send" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
