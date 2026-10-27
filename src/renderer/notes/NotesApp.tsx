import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { childLines, indentUnder, noteLines, notePlan, noteTitle } from '../../shared/notePlan'
import { Markdown } from '../chat/markdown'
import { useConfirm } from '../panel/ConfirmDialog'
import { IconButton } from '../panel/IconButton'
import { useDismiss } from '../useDismiss'
import { NotesEditor, type LineActions } from './NotesEditor'
import { keysOf } from '../shortcuts'

interface Info { id: string; title: string; updatedAt: number }
interface Project { path: string; name: string }
interface Agent { id: string; name: string; provider: string }

const MAC = /Mac/.test(navigator.platform)
const clean = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
const last = (folder: string) => `aw.notes.last.${folder}`
const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode: nothing is remembered */ } }
}

/** The notes window: Markdown notes of the project, kept apart from each other, that stay above every other window. A line of a checklist becomes a task or a subtask, and an agent can be asked about it or given it. */
export function NotesApp() {
  const [projects, setProjects] = useState<Project[]>([])
  const [folder, setFolder] = useState<string | null>(null)
  const [notes, setNotes] = useState<Info[]>([])
  const [id, setId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(false)
  const [menu, setMenu] = useState<null | 'notes'>(null)
  // A panel beside the note (making tasks, asking an agent): the window is made wider for it, so it never covers the note.
  const [panel, setPanel] = useState<null | { kind: 'make' } | { kind: 'ask'; line: number }>(null)
  const [lineMenu, setLineMenu] = useState<null | { line: number; top: number; right: number }>(null)
  const [sideAt, setSideAt] = useState<'left' | 'right'>('right')
  const [pinned, setPinned] = useState(true)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [lists, setLists] = useState<string[]>([])
  const [confirm, confirmNode] = useConfirm()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ folder, id, text })
  latest.current = { folder, id, text }
  const fail = useCallback((e: unknown) => setError(clean(e)), [])

  // The project it is beside: the one the app's front window shows, until another is chosen here.
  const refreshProjects = useCallback(async () => {
    const c = await window.aw.notes.context()
    setProjects(c.projects)
    setFolder((cur) => cur ?? (c.folder && store.get('aw.notes.folder') !== null && c.projects.some((p) => p.path === store.get('aw.notes.folder')) ? store.get('aw.notes.folder') : c.folder ?? c.projects[0]?.path ?? null))
  }, [])
  useEffect(() => {
    void refreshProjects().catch(fail)
    void window.aw.notes.pinned().then(setPinned, fail)
    window.addEventListener('focus', refreshProjects as () => void)
    return () => window.removeEventListener('focus', refreshProjects as () => void)
  }, [refreshProjects, fail])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      const l = latest.current
      if (l.folder && l.id) await window.aw.notes.write(l.folder, l.id, l.text)
    }
  }, [])
  const reload = useCallback(async (f: string, want?: string) => {
    const list = await window.aw.notes.list(f)
    let pick = want ?? store.get(last(f)) ?? list[0]?.id
    if (!pick || !list.some((n) => n.id === pick)) pick = list[0]?.id
    if (!pick) pick = await window.aw.notes.create(f)
    setNotes(list.some((n) => n.id === pick) ? list : await window.aw.notes.list(f))
    setId(pick)
    store.set(last(f), pick)
    setText(await window.aw.notes.read(f, pick))
  }, [])
  useEffect(() => {
    if (!folder) return
    void flush().then(() => reload(folder)).catch(fail)
    void window.aw.notes.agents(folder).then(setAgents, fail)
  }, [folder, reload, flush, fail])
  useEffect(() => {
    const out = () => void flush()
    window.addEventListener('pagehide', out)
    return () => window.removeEventListener('pagehide', out)
  }, [flush])

  const edit = (t: string) => {
    setText(t)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const l = latest.current
      if (l.folder && l.id) void window.aw.notes.write(l.folder, l.id, latest.current.text).then(() => window.aw.notes.list(l.folder!).then(setNotes), fail)
    }, 400)
  }
  const open = async (to: string) => {
    if (!folder) return
    await flush()
    setId(to)
    store.set(last(folder), to)
    setText(await window.aw.notes.read(folder, to))
    setMenu(null)
  }
  const create = async () => {
    if (!folder) return
    await flush()
    const n = await window.aw.notes.create(folder)
    await reload(folder, n)
    setPreview(false)
  }
  const remove = async (n: Info) => {
    if (!folder || !(await confirm({ title: `Delete “${n.title}”?`, body: 'The note is deleted. Tasks made from it stay on the board.', confirm: 'Delete', danger: true }))) return
    await flush()
    await window.aw.notes.remove(folder, n.id)
    await reload(folder, n.id === id ? undefined : id ?? undefined)
  }

  // Tasks: the note is saved first, so what is made is what is on the screen; it comes back marked with the numbers.
  const makeTasks = async (only?: number[]) => {
    if (!folder || !id) return { made: [] as { line: number; id: string }[] }
    await flush()
    await window.aw.notes.write(folder, id, latest.current.text)
    const r = await window.aw.notes.tasks(folder, id, only)
    setText(r.text)
    return r
  }
  const withParts = (line: number) => [line, ...childLines(text, line)]
  const actions: LineActions = {
    task: (line) => void makeTasks(withParts(line)).catch(fail),
    subtask: (line) => {
      const ls = noteLines(text)
      const me = ls[line]
      if (!me) return
      if (me.indent < 2) {
        const t = indentUnder(text, line)
        if (!t) return setError('There is no item above it to be a subtask of.')
        setText(t)
        latest.current = { ...latest.current, text: t }
        // The item above (its umbrella) is made with it when it is not a task yet.
        const top = [...ls.slice(0, line)].reverse().find((l) => l.kind === 'item' && l.indent < 2)
        return void makeTasks([...(top && !top.todo ? [top.line] : []), ...withParts(line)]).catch(fail)
      }
      const top = [...ls.slice(0, line)].reverse().find((l) => l.kind === 'item' && l.indent < 2)
      void makeTasks([...(top && !top.todo ? [top.line] : []), line]).catch(fail)
    },
    ask: (line) => void showPanel({ kind: 'ask', line }).catch(fail),
    menu: (line, anchor) => {
      const r = anchor.getBoundingClientRect()
      setLineMenu((cur) => (cur?.line === line ? null : { line, top: r.bottom + 4, right: window.innerWidth - r.right }))
    }
  }

  const info = notes.find((n) => n.id === id)
  const plan = useMemo(() => notePlan(text, lists), [text, lists])
  const openMake = () => {
    if (!folder) return
    void window.aw.todos.get(folder).then((r) => setLists(r.board.lists), fail)
    void showPanel({ kind: 'make' }).catch(fail)
  }
  const toggleBox = (n: number) => {
    // The nth box of the rendered note is the nth checklist line.
    const lines = text.split('\n')
    let k = -1
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*[-*+]\s+\[[ xX]\]/.test(lines[i]!)) continue
      if (++k === n) return edit(lines.map((l, j) => (j === i ? l.replace(/\[([ xX])\]/, (_, c: string) => (c === ' ' ? '[x]' : '[ ]')) : l)).join('\n'))
    }
  }
  // The boxes of the drawn Markdown are disabled, as for a reply; here they are the note's own and can be ticked.
  const drawn = useRef<HTMLDivElement>(null)
  useEffect(() => {
    drawn.current?.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((b) => (b.disabled = false))
  }, [text, preview])
  const showPanel = async (p: NonNullable<typeof panel>) => {
    // The panel is 280 pixels of the page; the window is measured in screen pixels, and the page may be zoomed.
    const zoom = window.outerWidth / Math.max(1, window.innerWidth)
    const at = await window.aw.notes.side(Math.round(280 * zoom))
    setSideAt(at ?? 'right')
    setPanel(p)
  }
  const closePanel = () => {
    setPanel(null)
    void window.aw.notes.side(0)
  }
  const wrap = useRef<HTMLDivElement>(null)
  useDismiss(wrap, menu !== null, () => setMenu(null))

  return (
    <div className={`nt${MAC ? ' mac' : ''}${panel ? ` side-${sideAt}` : ''}`} role="application" aria-label="Notes">
      {panel && folder && (
        <aside className="nt-side" aria-label={panel.kind === 'make' ? 'Make tasks from this note' : 'Ask an agent'}>
          {panel.kind === 'make' ? (
            <div role="dialog" aria-label="Make tasks from this note" className="nt-panel">
              <h5>Make tasks from this note</h5>
              {plan.length === 0 && <p className="hint">Nothing to make: write a checklist (<code>- [ ] a thing</code>), and indent a line to make it a subtask. Lines that are tasks already are left out.</p>}
              {plan.map((t) => <div key={t.line} className={`nt-tk${t.parent !== undefined || t.parentTodo ? ' s' : ''}`}><span>{t.title}</span><small>{t.parent !== undefined || t.parentTodo ? 'subtask' : (t.list ?? 'Inbox')}</small></div>)}
              <MakeFooter agents={agents} count={plan.length} onCancel={closePanel} onMake={async (agentId) => {
                try {
                  const r = await makeTasks()
                  closePanel()
                  const tops = new Set(plan.filter((t) => t.parent === undefined && !t.parentTodo).map((t) => t.line))
                  if (agentId) for (const m of r.made) if (tops.has(m.line)) await window.aw.notes.ask(folder, m.id, agentId, 'work', '')
                } catch (e) { fail(e) }
              }} />
            </div>
          ) : (
            <AskBox line={panel.line} text={text} agents={agents} onClose={closePanel} onSend={async (agentId, mode, words) => {
              try {
                let todo = noteLines(text)[panel.line]?.todo
                if (!todo) todo = (await makeTasks(withParts(panel.line))).made.find((m) => m.line === panel.line)?.id
                if (!todo) throw new Error('That line is not an item.')
                await window.aw.notes.ask(folder, todo, agentId, mode, words)
                closePanel()
              } catch (e) { fail(e) }
            }} />
          )}
        </aside>
      )}
      <div className="nt-main">
      <header className="nt-bar">
        {/* On a Mac the window's own red, yellow and green buttons are used; elsewhere there is one to hide it. */}
        {!MAC && <button className="nt-close" aria-label="Hide notes" title="Hide (Alt+Ctrl+N shows it again)" onClick={() => void window.aw.notes.hide()} />}
        <b className="nt-title">{noteTitle(text)}</b>
        <span className="nt-tools" ref={wrap}>
          <IconButton icon="list" label="Notes" tip="Your notes in this project: open one or delete it" expanded={menu === 'notes'} haspopup onClick={() => setMenu(menu === 'notes' ? null : 'notes')} />
          <IconButton icon="pin" label={pinned ? 'Stop keeping on top' : 'Keep on top'} tip={pinned ? 'It stays above every window. Click to let other windows cover it' : 'Click to keep it above every window'} pressed={pinned} onClick={() => void window.aw.notes.pin(!pinned).then(setPinned, fail)} />
          <IconButton icon={preview ? 'pen' : 'eye'} label={preview ? 'Edit' : 'Preview'} tip={preview ? 'Back to writing' : 'See the Markdown drawn in full'} pressed={preview} onClick={() => setPreview((p) => !p)} />
          <IconButton icon="plus" label="New note" tip="Start a new note, kept apart from the others" onClick={() => void create().catch(fail)} />
          {menu === 'notes' && (
            <div className="td-pop nt-pop nt-list" role="menu" aria-label="Notes of this project">
              {notes.map((n) => (
                <div key={n.id} className={`nt-row${n.id === id ? ' on' : ''}`}>
                  <button role="menuitem" onClick={() => void open(n.id).catch(fail)}>{n.title}</button>
                  <button className="nt-del" aria-label={`Delete ${n.title}`} onClick={() => void remove(n).catch(fail)}>×</button>
                </div>
              ))}
            </div>
          )}
        </span>
      </header>
      {error && <p className="error nt-error" role="alert" onClick={() => setError('')}>{error}</p>}
      <div className="nt-body">
        {preview ? (
          <div className="nt-preview md" ref={drawn} onClick={(e) => {
            const box = (e.target as HTMLElement).closest('input[type=checkbox]')
            if (!box) return
            e.preventDefault()
            toggleBox([...e.currentTarget.querySelectorAll('input[type=checkbox]')].indexOf(box))
          }}>
            <Markdown text={text} />
          </div>
        ) : <NotesEditor value={text} onChange={edit} actions={actions} />}
      </div>
      <footer className="nt-foot">
        <span>{text.length} characters</span>
        <select aria-label="Project" value={folder ?? ''} onChange={(e) => (store.set('aw.notes.folder', e.target.value), setFolder(e.target.value))}>
          {projects.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
        </select>
        <button className="nt-makebtn" disabled={!info} aria-expanded={panel?.kind === 'make'} onClick={() => (panel?.kind === 'make' ? closePanel() : openMake())}>Make tasks…</button>
      </footer>
      </div>
      {lineMenu && <LineMenu line={lineMenu.line} at={lineMenu} text={text} actions={actions} onClose={() => setLineMenu(null)} />}
      {confirmNode}
    </div>
  )
}

/** What can be done with a line, from its handle: the keys are shown beside each. A line that is a task already can only be asked about. */
function LineMenu({ line, at, text, actions, onClose }: { line: number; at: { top: number; right: number }; text: string; actions: LineActions; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, true, onClose)
  const l = noteLines(text)[line]
  if (!l) return null
  const items: { label: string; keys: string; run: () => void }[] = [
    ...(l.todo ? [] : l.indent >= 2 ? [] : [{ label: '→ Task', keys: keysOf('note-task'), run: () => actions.task(line) }]),
    ...(l.todo ? [] : [{ label: '→ Subtask', keys: keysOf('note-subtask'), run: () => actions.subtask(line) }]),
    { label: 'Ask agent', keys: keysOf('note-ask'), run: () => actions.ask(line) }
  ]
  return (
    <div className="td-pop nt-menu" ref={ref} role="menu" aria-label="Line actions" style={{ top: at.top, right: at.right }}>
      {items.map((i) => <button key={i.label} role="menuitem" onClick={() => (onClose(), i.run())}><span>{i.label}</span><kbd>{i.keys}</kbd></button>)}
    </div>
  )
}

function MakeFooter({ agents, count, onCancel, onMake }: { agents: Agent[]; count: number; onCancel: () => void; onMake: (agentId: string) => Promise<void> }) {
  const [agent, setAgent] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <>
      {agents.length > 0 && count > 0 && (
        <label className="nt-give">Then give the tasks to
          <select aria-label="Give to" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">Nobody yet</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.provider === 'agy' ? 'agy' : 'Claude'}</option>)}
          </select>
        </label>
      )}
      <div className="nt-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={count === 0 || busy} onClick={() => (setBusy(true), void onMake(agent).finally(() => setBusy(false)))}>Make {count} task{count === 1 ? '' : 's'}</button>
      </div>
    </>
  )
}

/** Ask an agent about a line, or put it on the task: the line is made a task first when it is not one. */
function AskBox({ line, text, agents, onClose, onSend }: { line: number; text: string; agents: Agent[]; onClose: () => void; onSend: (agentId: string, mode: 'ask' | 'work', words: string) => Promise<void> }) {
  const [agent, setAgent] = useState(agents[0]?.id ?? '')
  const [mode, setMode] = useState<'ask' | 'work'>('work')
  const [words, setWords] = useState('')
  const [busy, setBusy] = useState(false)
  const title = noteLines(text)[line]?.title ?? ''
  if (agents.length === 0) return <div className="nt-panel" role="dialog" aria-label="Ask an agent"><p className="hint">No agent in this project yet. Hire one to ask it about “{title}”.</p></div>
  return (
    <div className="nt-panel" role="dialog" aria-label="Ask an agent">
      <h5>“{title}”</h5>
      <select aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.provider === 'agy' ? 'agy' : 'Claude'}</option>)}</select>
      <div className="td-mode" role="group" aria-label="What to ask">
        <button aria-pressed={mode === 'work'} onClick={() => setMode('work')}>Work on it</button>
        <button aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>Ask a question</button>
      </div>
      <textarea aria-label="What to say" rows={2} placeholder={mode === 'ask' ? 'Your question' : 'Anything to add? (optional)'} value={words} onChange={(e) => setWords(e.target.value)} />
      <div className="nt-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || (mode === 'ask' && !words.trim())} onClick={() => (setBusy(true), void onSend(agent, mode, words).finally(() => setBusy(false)))}>Send</button>
      </div>
    </div>
  )
}
