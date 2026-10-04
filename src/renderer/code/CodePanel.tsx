import { useCallback, useEffect, useRef, useState } from 'react'
import type { Changes } from '../../shared/api'
import { ContextTray, type CodeJump, useAskSelection } from './askAgent'
import { codeContext } from './codeContext'
import { editorOptions, languageFor, monaco } from './monaco'
import { closeTab, openTab, type TabState } from './tabs'
import { ancestors, visibleRows } from './tree'

type Tab = 'changes' | 'files'
/** Ask the Code view to open a file in the Files tab, or just a tab; a new object each time so asking twice works. */
export interface OpenRequest {
  path?: string
  tab?: Tab
  /** Lines to select once the file is open. */
  range?: { from: number; to: number }
}

const STATUS_MARK = { added: 'A', modified: 'M', deleted: 'D' } as const

function useErrors() {
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(f: () => Promise<T>) => {
    setError(null)
    try {
      return await f()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
      return undefined
    }
  }, [])
  return { error, run, setError }
}

/** Review an agent's work (diff against its base) and edit files in its worktree. */
export function CodePanel({ agentId, agentName, workDone, openFile, onOpenChat }: { agentId: string; agentName: string; workDone: number; openFile?: OpenRequest; onOpenChat: () => void }) {
  const [tab, setTab] = useState<Tab>(openFile ? (openFile.tab ?? 'files') : 'changes')
  // What to open in the Files tab: what was asked from outside, or the lines of a chip clicked under the editor.
  const [request, setRequest] = useState<OpenRequest | undefined>(openFile)
  useEffect(() => {
    if (openFile) (setTab(openFile.tab ?? 'files'), setRequest(openFile))
  }, [openFile])
  const jump = (j: CodeJump) => (setRequest({ path: j.path, tab: 'files', range: { from: j.from, to: j.to } }), setTab('files'))
  return (
    <div className="code">
      <div className="tabs" role="tablist">
        {(['changes', 'files'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'changes' ? 'Changes' : 'Files'}
          </button>
        ))}
      </div>
      {tab === 'changes' ? <ChangesView agentId={agentId} agentName={agentName} workDone={workDone} onJump={jump} onOpenChat={onOpenChat} /> : <FilesView agentId={agentId} agentName={agentName} openFile={request} onOpenChat={onOpenChat} />}
    </div>
  )
}

function ChangesView({ agentId, agentName, workDone, onJump, onOpenChat }: { agentId: string; agentName: string; workDone: number; onJump: (j: CodeJump) => void; onOpenChat: () => void }) {
  const [data, setData] = useState<Changes | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrors()
  const host = useRef<HTMLDivElement>(null)
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const shown = useRef<string | null>(null)
  shown.current = path
  // Selected code in a diff goes in as the code after the change, with what the same lines were before when the selection touches a change.
  const ask = useAskSelection({
    agentId,
    agentName,
    host: wrap,
    describe: (e, sel) => {
      const p = shown.current
      const d = diff.current
      if (!p || !d) return null
      const from = sel.startLineNumber
      const to = sel.endColumn === 1 && sel.endLineNumber > from ? sel.endLineNumber - 1 : sel.endLineNumber
      const hit = (d.getLineChanges() ?? []).filter((c) => c.originalEndLineNumber > 0 && c.modifiedStartLineNumber <= to && (c.modifiedEndLineNumber || c.modifiedStartLineNumber) >= from)
      const orig = d.getModel()?.original
      const before = hit.length && orig ? { from: Math.min(...hit.map((c) => c.originalStartLineNumber)), to: Math.max(...hit.map((c) => c.originalEndLineNumber)) } : null
      const text = codeContext({
        path: p,
        from,
        to,
        code: e.getModel()!.getValueInRange(sel),
        after: true,
        ...(before && orig && { before: { ...before, code: orig.getValueInRange(new monaco.Range(before.from, 1, before.to, orig.getLineMaxColumn(before.to))) } })
      })
      return { text, label: `${p.slice(p.lastIndexOf('/') + 1)}:${from === to ? from : `${from}–${to}`}`, jump: { path: p, from, to } }
    }
  })
  const attachAsk = ask.attach

  const refresh = useCallback(() => void run(async () => setData(await window.aw.code.changes(agentId))), [agentId, run])
  // Re-read whenever the agent writes or edits another file.
  useEffect(refresh, [refresh, workDone])

  useEffect(() => {
    diff.current = monaco.editor.createDiffEditor(host.current!, { ...editorOptions, readOnly: true, renderSideBySide: false })
    const asking = attachAsk(diff.current.getModifiedEditor())
    return () => {
      asking.dispose()
      const m = diff.current?.getModel()
      diff.current?.dispose()
      m?.original.dispose()
      m?.modified.dispose()
    }
  }, [])

  useEffect(() => {
    if (!path || !diff.current) return
    void run(async () => {
      const { original, current } = await window.aw.code.diff(agentId, path)
      const lang = languageFor(path)
      const old = diff.current!.getModel()
      diff.current!.setModel({ original: monaco.editor.createModel(original, lang), modified: monaco.editor.createModel(current, lang) })
      old?.original.dispose()
      old?.modified.dispose()
    })
  }, [agentId, path, run, data])

  // `run` yields undefined only on failure, so success always refreshes and says what happened.
  const act = async (label: string, f: () => Promise<string | void>) => {
    setNotice(null)
    const r = await run(async () => (await f()) ?? '')
    if (r === undefined) return
    setNotice(r ? `${label}: ${r}` : label)
    refresh()
  }

  return (
    <div className="changes">
      <div className="change-list">
        <div className="change-head">
          {data ? (
            <>
              <code>{data.branch}</code> vs <code>{data.base}</code> · {data.files.length} file{data.files.length === 1 ? '' : 's'}
            </>
          ) : (
            'Loading…'
          )}
          <button onClick={refresh} title="Refresh">
            ↻
          </button>
        </div>
        <ul>
          {data?.files.map((f) => (
            <li key={f.path} className={f.path === path ? 'on' : ''}>
              <button className={`file is-${f.status}`} onClick={() => setPath(f.path)} title={f.path}>
                <span className="mark">{STATUS_MARK[f.status]}</span>
                {f.path}
              </button>
              <button
                className="discard"
                title={`Discard uncommitted changes to ${f.path}`}
                onClick={() => window.confirm(`Discard uncommitted changes to ${f.path}? This cannot be undone.`) && act('Discarded', () => window.aw.code.discard(agentId, f.path))}
              >
                ✕
              </button>
            </li>
          ))}
          {data && data.files.length === 0 && <li className="empty">No changes yet.</li>}
        </ul>
        <form
          className="land"
          onSubmit={(e) => {
            e.preventDefault()
            void act('Committed', async () => {
              await window.aw.code.commit(agentId, message)
              setMessage('')
            })
          }}
        >
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Commit message" aria-label="Commit message" />
          <button type="submit" disabled={!message.trim()}>
            Commit all
          </button>
        </form>
        <div className="land">
          <button
            onClick={() => data && window.confirm(`Merge ${data.branch} into ${data.base} in your checkout?`) && act('Merged into', () => window.aw.code.merge(agentId))}
          >
            Merge into {data?.base ?? 'base'}
          </button>
          <button
            onClick={() => data && window.confirm(`Push ${data.branch} to origin and open a pull request against ${data.base}?`) && act('Pull request', () => window.aw.code.pr(agentId))}
          >
            Push &amp; open PR
          </button>
        </div>
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="files-ed">
        {path && (
          <div className="fcrumb">
            <span className="fpath" title={path}>{path}</span>
            <span aria-hidden="true">·</span>
            <span className="flang">{{ added: 'new file', modified: 'changed', deleted: 'deleted' }[data?.files.find((f) => f.path === path)?.status ?? 'modified']} vs {data?.base ?? 'base'}</span>
          </div>
        )}
        <div className="files-edwrap" ref={wrap}>
          <div className="diff" ref={host} aria-label={path ? `Diff of ${path}` : 'Diff'} data-hint={path ? undefined : 'Pick a file to review its changes'} />
          {ask.view}
        </div>
        <ContextTray agentId={agentId} onJump={onJump} onOpenChat={onOpenChat} />
      </div>
    </div>
  )
}

/** What is open in the Files view of each agent. It lives outside the view, so flipping to Changes and back loses nothing. */
interface Session {
  tabs: TabState
  /** What each open file held when it was read or last saved: unlike this, what the editor holds may be edited. */
  saved: Map<string, string>
  views: Map<string, monaco.editor.ICodeEditorViewState | null>
  subs: Map<string, monaco.IDisposable>
}
const sessions = new Map<string, Session>()
const sessionOf = (agentId: string): Session => sessions.get(agentId) ?? sessions.set(agentId, { tabs: { open: [], active: null }, saved: new Map(), views: new Map(), subs: new Map() }).get(agentId)!
const uriOf = (agentId: string, path: string) => monaco.Uri.from({ scheme: 'aw-file', authority: agentId, path: `/${path}` })
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)

function FilesView({ agentId, agentName, openFile, onOpenChat }: { agentId: string; agentName: string; openFile?: OpenRequest; onOpenChat: () => void }) {
  const sess = sessionOf(agentId)
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [tabs, setTabs] = useState<TabState>(sess.tabs)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState<string | null>(null)
  const [, bump] = useState(0)
  const { error, run } = useErrors()
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const model = (p: string) => monaco.editor.getModel(uriOf(agentId, p))
  const dirtyOf = (p: string) => {
    const m = model(p)
    return !!m && m.getValue() !== sess.saved.get(p)
  }
  const active = tabs.active

  const ask = useAskSelection({
    agentId,
    agentName,
    host: wrap,
    describe: (e, sel) => {
      const p = sess.tabs.active
      if (!p) return null
      const from = sel.startLineNumber
      const to = sel.endColumn === 1 && sel.endLineNumber > from ? sel.endLineNumber - 1 : sel.endLineNumber
      return { text: codeContext({ path: p, from, to, code: e.getModel()!.getValueInRange(sel) }), label: `${baseName(p)}:${from === to ? from : `${from}–${to}`}`, jump: { path: p, from, to } }
    }
  })
  const attachAsk = ask.attach

  const loadFiles = useCallback(() => void run(async () => setFiles(await window.aw.code.files(agentId))), [agentId, run])
  useEffect(loadFiles, [loadFiles])

  // Show a file (or nothing) in the editor, putting the cursor and scroll back where they were, or on the lines asked for.
  const show = (p: string | null, range?: { from: number; to: number }) => {
    const e = editor.current!
    e.setModel(p ? model(p) : null)
    if (!p) return
    const m = model(p)!
    const view = sess.views.get(p)
    if (range) {
      e.setSelection(new monaco.Range(range.from, 1, range.to, m.getLineMaxColumn(range.to)))
      e.revealLineInCenter(range.from)
    } else if (view) e.restoreViewState(view)
    e.focus()
  }
  const rememberView = () => {
    const a = sess.tabs.active
    if (a && editor.current) sess.views.set(a, editor.current.saveViewState())
  }
  const setTabState = (next: TabState) => ((sess.tabs = next), setTabs(next))

  const open = (p: string, range?: { from: number; to: number }) =>
    void run(async () => {
      if (!model(p)) {
        const text = await window.aw.code.read(agentId, p)
        const m = monaco.editor.createModel(text, languageFor(p), uriOf(agentId, p))
        sess.saved.set(p, text)
        sess.subs.set(p, m.onDidChangeContent(() => bump((n) => n + 1)))
      }
      rememberView()
      setAsking(null)
      setTabState(openTab(sess.tabs, p))
      show(p, range)
    })

  const switchTo = (p: string) => {
    if (p === sess.tabs.active) return editor.current?.focus()
    rememberView()
    setAsking(null)
    setTabState({ ...sess.tabs, active: p })
    show(p)
  }

  const close = (p: string, force = false) => {
    // An unsaved tab asks first, and is brought forward so what would be lost can be seen.
    if (!force && dirtyOf(p)) {
      if (sess.tabs.active !== p) switchTo(p)
      return setAsking(p)
    }
    rememberView()
    const wasActive = sess.tabs.active === p
    const next = closeTab(sess.tabs, p)
    model(p)?.dispose()
    sess.subs.get(p)?.dispose()
    for (const m of [sess.subs, sess.saved, sess.views] as Map<string, unknown>[]) m.delete(p)
    setAsking(null)
    setTabState(next)
    if (wasActive) show(next.active)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  const save = async () => {
    const p = sess.tabs.active
    const m = p && model(p)
    if (!p || !m) return
    await run(async () => {
      const text = m.getValue()
      await window.aw.code.write(agentId, p, text)
      sess.saved.set(p, text)
      bump((n) => n + 1)
    })
  }
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const e = monaco.editor.create(host.current!, { ...editorOptions, model: null })
    editor.current = e
    const parts = [
      attachAsk(e),
      e.addAction({ id: 'aw.save', label: 'Save', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => void saveRef.current() }),
      e.addAction({ id: 'aw.closeTab', label: 'Close tab', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW], run: () => void (sess.tabs.active && closeRef.current(sess.tabs.active)) })
    ]
    show(sess.tabs.active)
    return () => {
      rememberView()
      parts.forEach((x) => x.dispose())
      // The models stay: they are the open tabs, kept for when this view comes back.
      e.setModel(null)
      e.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- made once, with the view
  }, [])

  useEffect(() => {
    if (openFile?.path) open(openFile.path, openFile.range)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request should open a file
  }, [openFile])

  // The tree follows the tab shown: the folders above its file open and the file scrolls into view.
  useEffect(() => {
    if (!active) return
    setOpenDirs((s) => new Set([...s, ...ancestors(active)]))
    const f = requestAnimationFrame(() => list.current?.querySelector('li.on')?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(f)
  }, [active])

  const toggle = (dir: string) =>
    setOpenDirs((s) => {
      const n = new Set(s)
      if (!n.delete(dir)) n.add(dir)
      return n
    })

  const rows = visibleRows(files, openDirs, filter)
  const dirty = !!active && dirtyOf(active)
  return (
    <div className="changes">
      <div className="change-list">
        <div className="tree-head">
          <span>Files</span>
          <button className="icon" onClick={loadFiles} title="Refresh the file list" aria-label="Refresh the file list">
            ↻
          </button>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search…" aria-label="Filter files" />
        <ul className="tree" ref={list} role="tree">
          {rows.map((r) => (
            <li key={r.path} className={r.path === active ? 'on' : ''} role="treeitem" aria-expanded={r.dir ? filter !== '' || openDirs.has(r.path) : undefined}>
              <button
                className={`file ${r.dir ? 'is-dir' : ''}`}
                style={{ paddingLeft: 6 + r.depth * 14 }}
                onClick={() => (r.dir ? toggle(r.path) : open(r.path))}
                title={r.path}
              >
                <span className="chev">{r.dir ? (filter !== '' || openDirs.has(r.path) ? '▾' : '▸') : ''}</span>
                {r.name}
              </button>
            </li>
          ))}
          {files.length > 0 && rows.length === 0 && <li className="empty">No files match.</li>}
        </ul>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="files-ed">
        {tabs.open.length > 0 && (
          <div className="ftabs" role="tablist" aria-label="Open files">
            {tabs.open.map((p) => (
              <div
                key={p}
                className={`ftab ${p === active ? 'on' : ''}`}
                role="tab"
                tabIndex={0}
                aria-selected={p === active}
                title={p}
                onClick={() => switchTo(p)}
                onAuxClick={(e) => e.button === 1 && (e.preventDefault(), close(p))}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), switchTo(p))}
              >
                <span className="nm">{baseName(p)}</span>
                {dirtyOf(p) && <i className="fdot" title="Unsaved changes" />}
                <button className="x" aria-label={`Close ${baseName(p)}`} title="Close (⌘W)" onClick={(e) => (e.stopPropagation(), close(p))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {active && (
          <div className="fcrumb">
            <span className="fpath" title={active}>{active}</span>
            <span aria-hidden="true">·</span>
            <span className="flang">{languageFor(active)}</span>
            <button onClick={() => void save()} disabled={!dirty} title="Save this file (⌘S)">
              Save{dirty ? ' •' : ''}
            </button>
          </div>
        )}
        {asking && (
          <div className="fask" role="alert">
            <span>
              Discard unsaved changes to <b>{baseName(asking)}</b>?
            </span>
            <button className="danger" onClick={() => close(asking, true)}>
              Discard
            </button>
            <button onClick={() => (setAsking(null), editor.current?.focus())}>Keep editing</button>
          </div>
        )}
        <div className="files-edwrap" ref={wrap}>
          <div className="diff" ref={host} aria-label={active ? `Editing ${active}` : 'Editor'} data-hint={active ? undefined : 'Pick a file to edit it'} />
          {ask.view}
        </div>
        <ContextTray agentId={agentId} onJump={(j) => open(j.path, { from: j.from, to: j.to })} onOpenChat={onOpenChat} />
      </div>
    </div>
  )
}
