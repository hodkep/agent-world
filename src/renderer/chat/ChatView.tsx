import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteCommand } from '../../shared/api'
import type { ChatItem } from '../../shared/chat'
import type { Activity } from '../../shared/types'
import { PICKABLE_MODES, cssColor, modeInfo } from '../../shared/modes'
import { type NeedActions, NeedPanel, type Need, needTitle } from '../panel/InputDialog'
import { type Row, type Sent, rowText, toMarkdown, toRows } from './format'
import { Lightbox, Picture } from './Images'
import { Markdown } from './markdown'
import { UserText } from './Mentions'
import { ToolCard } from './ToolCard'

const BUSY: Activity[] = ['thinking', 'researching', 'implementing', 'running', 'delegating', 'compacting']
const VERB: Partial<Record<Activity, string>> = {
  thinking: 'is thinking',
  researching: 'is reading',
  implementing: 'is writing code',
  running: 'is running a command',
  delegating: 'is delegating',
  compacting: 'is compacting the conversation'
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
  const rows = useMemo(() => {
    const q = query?.trim().toLowerCase()
    return q ? allRows.filter((r) => rowText(r).toLowerCase().includes(q)) : allRows
  }, [allRows, query])

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
      const p = { id: `pending-${Date.now()}`, text: text.trim(), at: Date.now(), queued: BUSY.includes(activity) }
      setSent((cur) => [...cur, p])
      stick.current = true
      try {
        await window.aw.chatSend(agentId, text)
      } catch (err) {
        setSent((cur) => cur.filter((x) => x.id !== p.id))
        setError(errText(err))
        throw err
      }
      // If the transcript never shows it (the agent dropped it), stop pretending after a while.
      setTimeout(() => setSent((cur) => cur.filter((x) => x.id !== p.id)), 20_000)
    },
    [agentId, activity]
  )

  return (
    <div
      className="chat"
      hidden={!visible}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') (e.preventDefault(), setQuery((q) => q ?? ''))
      }}
    >
      <div className="chat-tools">
        {query === null ? (
          <button onClick={() => setQuery('')} title="Search this conversation (⌘F)">
            Search
          </button>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(null), e.stopPropagation())}
              placeholder="Search this conversation…"
              aria-label="Search this conversation"
              autoFocus
            />
            <span className="chat-count">{rows.length} of {allRows.length}</span>
            <button onClick={() => setQuery(null)}>Close</button>
          </>
        )}
        <span className="chat-tools-gap" />
        <Copy text={toMarkdown(allRows, agentName)} label="Copy as Markdown" />
      </div>
      <div className="chat-log" ref={log} onScroll={onScroll} role="log" aria-label={`Conversation with ${agentName}`} aria-live="polite">
        {rows.length === 0 && (
          <p className="chat-empty">
            {query ? 'Nothing matches.' : asleep ? `${agentName} is asleep. Wake them to continue this conversation.` : `Say something to ${agentName}. The conversation appears here as it happens.`}
          </p>
        )}
        {rows.map((r) => (
          <RowView key={r.id} row={r} agentId={agentId} agentName={agentName} busy={busy} onImage={setZoomed} />
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
      <Composer
        agentId={agentId}
        agentName={agentName}
        asleep={asleep}
        busy={busy}
        blocked={!!waiting}
        mode={mode}
        visible={visible}
        focusTick={focusTick}
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
  )
}

function RowView({ row: r, agentId, agentName, busy, onImage }: { row: Row; agentId: string; agentName: string; busy: boolean; onImage: (src: string) => void }) {
  switch (r.kind) {
    case 'user':
      return (
        <div className={`msg user ${r.pending ? 'pending' : ''}`}>
          <UserText agentId={agentId} text={r.text} onImage={onImage} />
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
          <Markdown text={r.text} />
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
      return <div className="msg note">{r.text}</div>
  }
}

interface Attachment {
  id: string
  name: string
  path: string
  /** A local preview for pictures. */
  preview?: string
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
  const [attached, setAttached] = useState<Attachment[]>([])
  const [over, setOver] = useState(false)
  const [modeOpen, setModeOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const pick = useRef<HTMLInputElement>(null)
  const sent = useRef<string[]>([])
  const recall = useRef(-1)
  const shell = text.startsWith('!')
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
  }, [text])

  // Files on disk are mentioned by their path; pasted pictures and other blobs are saved first.
  const attach = useCallback(
    async (list: File[]) => {
      for (const f of list) {
        try {
          const onDisk = window.aw.pathOf(f)
          const path = onDisk || (await window.aw.saveAttachment(agentId, f.name, await f.arrayBuffer(), f.type))
          setAttached((cur) => [...cur, { id: `${Date.now()}-${cur.length}`, name: f.name || path.split('/').pop()!, path, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined }])
        } catch (err) {
          onError(errText(err))
        }
      }
      box.current?.focus()
    },
    [agentId, onError]
  )

  // "/co" completes commands; the last "@word" completes a file or folder.
  const slash = /^\/(\S*)$/.exec(text)
  const mention = /(?:^|\s)@([^\s@]*)$/.exec(text)
  const folders = useMemo(() => [...new Set(files.flatMap((f) => f.split('/').slice(0, -1).map((_, i, a) => `${a.slice(0, i + 1).join('/')}/`)))], [files])
  const suggestions = useMemo<{ label: string; hint: string; insert: string }[]>(() => {
    if (slash) {
      const q = slash[1]!.toLowerCase()
      return commands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8).map((c) => ({ label: `/${c.name}`, hint: c.description, insert: `/${c.name}${c.args ? ' ' : ''}` }))
    }
    if (mention) {
      const q = mention[1]!.toLowerCase()
      const head = text.slice(0, mention.index + (mention[0].startsWith('@') ? 0 : 1))
      return [...folders, ...files]
        .filter((f) => f.toLowerCase().includes(q))
        .sort((a, b) => Number(b.toLowerCase().startsWith(q)) - Number(a.toLowerCase().startsWith(q)))
        .slice(0, 8)
        .map((f) => ({ label: f, hint: f.endsWith('/') ? 'folder' : '', insert: head + (/\s/.test(f) ? `@"${f}"` : `@${f}`) + (f.endsWith('/') ? '' : ' ') }))
    }
    return []
  }, [slash?.[1], mention?.[1], commands, files, folders, text])
  useEffect(() => setAt(0), [suggestions.length, slash?.[1], mention?.[1]])

  const submit = async () => {
    const value = text.trim()
    if (!value && attached.length === 0) return
    const mentions = attached.map((a) => `@"${a.path}"`).join(' ')
    // Attached files come first so the message reads "look at these: …".
    const full = mentions ? `${mentions}${value ? `\n${value}` : ''}` : value
    try {
      await onSend(full)
      if (value) (sent.current.unshift(value), (recall.current = -1))
      setText('')
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
            <li key={s.label} role="option" aria-selected={i === at} onMouseDown={(e) => (e.preventDefault(), setText(s.insert), box.current?.focus())} onMouseEnter={() => setAt(i)}>
              <b>{s.label}</b>
              {s.hint && <span>{s.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {attached.length > 0 && (
        <ul className="attached" aria-label="Attached files">
          {attached.map((a) => (
            <li key={a.id}>
              {a.preview ? (
                <button className="chip-img" onClick={() => onImage(a.preview!)} aria-label={`Preview ${a.name}`}>
                  <img src={a.preview} alt="" />
                </button>
              ) : (
                <span className="chip-file" aria-hidden="true" />
              )}
              <span className="chip-name" title={a.path}>
                {a.name}
              </span>
              <button className="chip-x" aria-label={`Remove ${a.name}`} onClick={() => setAttached((cur) => cur.filter((x) => x.id !== a.id))} />
            </li>
          ))}
        </ul>
      )}
      <div className="composer-row">
        {shell && <span className="shell-badge" title="Runs this command directly, without Claude interpreting it. Claude then sees the output.">shell</span>}
        <textarea
          ref={box}
          value={text}
          rows={1}
          placeholder={blocked ? `${agentName} is waiting for you above` : busy ? `${agentName} is working… your message goes in next` : `Message ${agentName}  ·  / commands  ·  @ files  ·  ! shell  ·  paste a picture`}
          aria-label={`Message ${agentName}`}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length) (e.preventDefault(), void attach(files))
          }}
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
            } else if (e.key === 'Escape' && busy) (onStopping(true), onStop())
            else if (e.key === 'Tab' && e.shiftKey) (e.preventDefault(), void window.aw.chatCycleMode(agentId).catch((err) => onError(errText(err))))
            else if (e.key === 'ArrowUp' && !text && sent.current.length) {
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
        <div className="composer-side">
          <input ref={pick} type="file" multiple hidden onChange={(e) => (void attach([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <button onClick={() => pick.current?.click()} title="Attach pictures or files (or paste, or drop them here)">
            Attach
          </button>
          {busy && (
            <button onClick={() => (onStopping(true), onStop())} disabled={stopping} title="Interrupt (Esc)">
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
          {busy && text.trim() && (
            <button
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
          <button className="primary" onClick={() => void submit()} disabled={!text.trim() && attached.length === 0}>
            Send
          </button>
        </div>
      </div>
      <div className="composer-foot">
        <span className="menu-wrap" ref={modeWrap}>
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
        <span className="hint-keys">Enter sends · Shift+Enter new line · Esc stops</span>
      </div>
    </div>
  )
}
