import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { ChatItem } from '../../shared/chat'
import type { Activity } from '../../shared/types'
import { Markdown } from './markdown'
import { type ToolRun, ToolCard } from './ToolCard'

const BUSY: Activity[] = ['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting']
const VERB: Partial<Record<Activity, string>> = {
  thinking: 'is thinking',
  researching: 'is reading',
  implementing: 'is writing code',
  running: 'is running a command',
  delegating: 'is delegating',
  compacting: 'is compacting the conversation'
}

type Row =
  | { kind: 'user'; id: string; text: string; pending?: boolean }
  | { kind: 'command'; id: string; name: string; args: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'thinking'; id: string }
  | { kind: 'tool'; id: string; run: ToolRun }
  | { kind: 'note'; id: string; text: string }

/** Items in order, with each tool's result folded into the call it answers. */
export function toRows(items: ChatItem[], pending: { id: string; text: string }[]): Row[] {
  const results = new Map<string, { text: string; isError: boolean }>()
  for (const i of items) if (i.kind === 'tool-result') results.set(i.toolUseId, { text: i.text, isError: i.isError })
  const rows: Row[] = []
  for (const i of items) {
    if (i.kind === 'tool-result') continue
    if (i.kind === 'tool') rows.push({ kind: 'tool', id: i.id, run: { name: i.name, input: i.input, result: results.get(i.toolUseId) } })
    else if (i.kind === 'thinking') {
      // A run of thinking blocks reads as one.
      if (rows.at(-1)?.kind !== 'thinking') rows.push({ kind: 'thinking', id: i.id })
    } else if (i.kind === 'user') rows.push({ kind: 'user', id: i.id, text: i.text })
    else if (i.kind === 'command') rows.push({ kind: 'command', id: i.id, name: i.name, args: i.args })
    else if (i.kind === 'assistant') rows.push({ kind: 'assistant', id: i.id, text: i.text })
    else rows.push({ kind: 'note', id: i.id, text: i.text })
  }
  // Messages sent from the composer show at once, until the transcript has them.
  const said = new Set(items.filter((i) => i.kind === 'user').map((i) => (i as { text: string }).text))
  for (const p of pending) if (!said.has(p.text)) rows.push({ kind: 'user', id: p.id, text: p.text, pending: true })
  return rows
}

const drafts = new Map<string, string>()

export function ChatView({
  agentId,
  agentName,
  activity,
  detail,
  asleep,
  waiting,
  visible,
  focusTick,
  onWake,
  onOpenNeed,
  onTerminal
}: {
  agentId: string
  agentName: string
  activity: Activity
  detail?: string
  asleep: boolean
  /** What the agent is waiting on you for ("allow?", "plan", "question"), if anything. */
  waiting: string | null
  visible: boolean
  focusTick: number
  onWake: () => void
  onOpenNeed: () => void
  onTerminal: () => void
}) {
  const [items, setItems] = useState<ChatItem[]>([])
  const [pending, setPending] = useState<{ id: string; text: string; at: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [away, setAway] = useState(false)
  const session = useRef('')

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

  const rows = useMemo(() => toRows(items, pending), [items, pending])
  const busy = BUSY.includes(activity)

  // Follow the conversation while the reader is at the bottom; leave them alone once they scroll up.
  useEffect(() => {
    const el = log.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
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
      const p = { id: `pending-${Date.now()}`, text: text.trim(), at: Date.now() }
      setPending((cur) => [...cur, p])
      stick.current = true
      try {
        await window.aw.chatSend(agentId, text)
      } catch (err) {
        setPending((cur) => cur.filter((x) => x.id !== p.id))
        setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
        throw err
      }
      // If the transcript never shows it (the agent dropped it), stop pretending after a while.
      setTimeout(() => setPending((cur) => cur.filter((x) => x.id !== p.id)), 20_000)
    },
    [agentId]
  )

  return (
    <div className="chat" hidden={!visible}>
      <div className="chat-log" ref={log} onScroll={onScroll} role="log" aria-label={`Conversation with ${agentName}`} aria-live="polite">
        {rows.length === 0 && (
          <p className="chat-empty">
            {asleep ? `${agentName} is asleep. Wake them to continue this conversation.` : `Say something to ${agentName}. The conversation appears here as it happens.`}
          </p>
        )}
        {rows.map((r) => {
          switch (r.kind) {
            case 'user':
              return (
                <div key={r.id} className={`msg user ${r.pending ? 'pending' : ''}`}>
                  <div className="bubble">{r.text}</div>
                  {r.pending && <span className="msg-meta">sending…</span>}
                </div>
              )
            case 'command':
              return (
                <div key={r.id} className="msg cmd">
                  <code>
                    {r.name} {r.args}
                  </code>
                </div>
              )
            case 'assistant':
              return (
                <div key={r.id} className="msg assistant">
                  <div className="who">{agentName}</div>
                  <Markdown text={r.text} />
                </div>
              )
            case 'thinking':
              return (
                <div key={r.id} className="msg think">
                  <span className="tc-dot" aria-hidden="true" /> Thought about it
                </div>
              )
            case 'tool':
              return <ToolCard key={r.id} run={r.run} working={busy} />
            case 'note':
              return (
                <div key={r.id} className="msg note">
                  {r.text}
                </div>
              )
          }
        })}
        {busy && (
          <div className="live" role="status">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {agentName} {VERB[activity]}
            {detail ? <span className="live-detail"> · {detail}</span> : null}
          </div>
        )}
      </div>
      {away && (
        <button className="jump" onClick={() => ((log.current!.scrollTop = log.current!.scrollHeight), (stick.current = true), setAway(false))}>
          Latest
        </button>
      )}
      {waiting && (
        <div className="chat-banner alarm" role="alert">
          <span className="blip" aria-hidden="true" />
          <span>
            {agentName} is waiting for you: <b>{waiting}</b>
          </span>
          <button className="primary" onClick={onOpenNeed}>
            Answer
          </button>
        </div>
      )}
      {error && (
        <div className="chat-banner" role="alert">
          <span>{error}</span>
          <button onClick={onTerminal}>Open terminal</button>
        </div>
      )}
      <Composer agentId={agentId} agentName={agentName} asleep={asleep} busy={busy} blocked={!!waiting} visible={visible} focusTick={focusTick} onSend={send} onWake={onWake} onStop={() => void window.aw.chatInterrupt(agentId)} />
    </div>
  )
}

function Composer({
  agentId,
  agentName,
  asleep,
  busy,
  blocked,
  visible,
  focusTick,
  onSend,
  onWake,
  onStop
}: {
  agentId: string
  agentName: string
  asleep: boolean
  busy: boolean
  blocked: boolean
  visible: boolean
  focusTick: number
  onSend: (text: string) => Promise<void>
  onWake: () => void
  onStop: () => void
}) {
  const [text, setText] = useState(() => drafts.get(agentId) ?? '')
  const [commands, setCommands] = useState<PaletteCommand[]>([])
  const [files, setFiles] = useState<string[]>([])
  const [at, setAt] = useState(0)
  const box = useRef<HTMLTextAreaElement>(null)
  const sent = useRef<string[]>([])
  const recall = useRef(-1)

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
  }, [text])

  // "/co" completes commands; the last "@word" completes a file.
  const slash = /^\/(\S*)$/.exec(text)
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(text)
  const suggestions = useMemo<{ label: string; hint: string; insert: string }[]>(() => {
    if (slash) {
      const q = slash[1]!.toLowerCase()
      return commands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8).map((c) => ({ label: `/${c.name}`, hint: c.description, insert: `/${c.name}${c.args ? ' ' : ''}` }))
    }
    if (mention) {
      const q = mention[1]!.toLowerCase()
      return files.filter((f) => f.toLowerCase().includes(q)).slice(0, 8).map((f) => ({ label: f, hint: '', insert: text.slice(0, mention.index + (mention[0].startsWith('@') ? 0 : 1)) + (/\s/.test(f) ? `@"${f}" ` : `@${f} `) }))
    }
    return []
  }, [slash?.[1], mention?.[1], commands, files, text])
  useEffect(() => setAt(0), [suggestions.length, slash?.[1], mention?.[1]])

  const submit = async () => {
    const value = text.trim()
    if (!value) return
    try {
      await onSend(value)
      sent.current.unshift(value)
      recall.current = -1
      setText('')
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
    <div className="composer">
      {suggestions.length > 0 && (
        <ul className="suggest" role="listbox" aria-label="Suggestions">
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === at} onMouseDown={(e) => (e.preventDefault(), setText(s.insert), box.current?.focus())} onMouseEnter={() => setAt(i)}>
              <b>{s.label}</b>
              {s.hint && <span>{s.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      <textarea
        ref={box}
        value={text}
        rows={1}
        placeholder={blocked ? `${agentName} is waiting for you above` : busy ? `${agentName} is working… your message goes in next` : `Message ${agentName}  ·  / for commands  ·  @ for files`}
        aria-label={`Message ${agentName}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (suggestions.length) {
            if (e.key === 'ArrowDown') (e.preventDefault(), setAt((i) => Math.min(suggestions.length - 1, i + 1)))
            else if (e.key === 'ArrowUp') (e.preventDefault(), setAt((i) => Math.max(0, i - 1)))
            else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && (slash || mention))) (e.preventDefault(), setText(suggestions[at]!.insert))
            if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key) || (e.key === 'Enter' && !e.shiftKey && (slash || mention))) return
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape' && busy) onStop()
          else if (e.key === 'ArrowUp' && !text && sent.current.length) {
            e.preventDefault()
            recall.current = Math.min(sent.current.length - 1, recall.current + 1)
            setText(sent.current[recall.current]!)
          }
        }}
      />
      <div className="composer-side">
        {busy && (
          <button onClick={onStop} title="Interrupt (Esc)">
            Stop
          </button>
        )}
        <button className="primary" onClick={() => void submit()} disabled={!text.trim()}>
          Send
        </button>
      </div>
    </div>
  )
}
