import { useCallback, useEffect, useRef, useState } from 'react'
import type { Changes } from '../../shared/api'
import { ContextTray, type CodeJump, useAskSelection } from './askAgent'
import { codeContext } from './codeContext'
import { Markdown } from '../chat/markdown'
import { openFileEvent } from '../files/context'
import { fileShows } from './fileShows'
import { ORIGINAL_NUMBER_CHARS, editorOptions, languageFor, monaco } from './monaco'
import { CONTEXTS, CONTEXT_KEY, FOLD_KEY, type Context, type Fold, foldOptions, readFold } from './foldRule'
import { closeTab, openTab, type TabState } from './tabs'
import { SideSizer, useSideWidth } from '../panel/SideSizer'
import { BasePicker } from '../panel/BasePicker'
import { ancestors, changeRows, visibleRows } from './tree'
import { RepoStrip } from './RepoStrip'
import { pickRepo, type RepoInfo } from './repoChips'
import { type ChangeMode, HistoryList, UncommittedList, ViewSwitch } from './ChangeViews'

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
export function CodePanel({ agentId, agentName, workDone, openFile, onOpenChat, inPlace }: { agentId: string; agentName: string; workDone: number; openFile?: OpenRequest; onOpenChat: () => void; /** Set when the agent works straight in the project folder (not a git worktree): there is no branch of its own to compare or merge, only what is uncommitted in the folder and the commits made since it was hired. */ inPlace?: { path: string } }) {
  const [place, setPlace] = useState<{ git: boolean; branch: string } | null>(null)
  useEffect(() => {
    if (inPlace) void window.aw.code.place(agentId).then(setPlace, () => setPlace({ git: false, branch: '' }))
  }, [agentId, inPlace])
  // A folder that is not a repository may hold several: their branches and uncommitted counts, read again when the agent writes a file.
  const [repos, setRepos] = useState<RepoInfo[] | null>(null)
  useEffect(() => {
    if (inPlace && place && !place.git) void window.aw.code.repos(agentId).then(setRepos, () => setRepos([]))
  }, [agentId, inPlace, place, workDone])
  const [remembered, setRemembered] = useState<string | null>(() => {
    try { return localStorage.getItem(`aw.repo.${agentId}`) } catch { return null }
  })
  const repo = repos ? pickRepo(repos, remembered) : null
  const chooseRepo = (name: string) => {
    setRemembered(name)
    try { localStorage.setItem(`aw.repo.${agentId}`, name) } catch { /* not remembered, still picked */ }
  }
  const [tab, setTab] = useState<Tab>(openFile ? (openFile.tab ?? 'files') : 'changes')
  // What to open in the Files tab: what was asked from outside, or the lines of a chip clicked under the editor.
  const [request, setRequest] = useState<OpenRequest | undefined>(openFile)
  useEffect(() => {
    if (openFile) (setTab(openFile.tab ?? 'files'), setRequest(openFile))
  }, [openFile])
  const jump = (j: CodeJump) => (setRequest({ path: j.path, tab: 'files', range: { from: j.from, to: j.to } }), setTab('files'))
  // A folder that is not a git repository has no changes to track: its files, as in a repository, and one line that says why there is no Changes.
  if (inPlace && place && !place.git && repos && repos.length === 0) {
    return (
      <div className="code code-plain">
        <p className="plain-note" role="note" aria-label="No git worktree">
          <b>{agentName} works directly in this folder</b> · not a git repository, so no changes to show. Run <code>git init</code> to track them.
        </p>
        <FilesView agentId={agentId} agentName={agentName} openFile={request} onOpenChat={onOpenChat} />
      </div>
    )
  }
  if (inPlace && (!place || (!place.git && !repos))) return <div className="code code-inplace" aria-busy="true" />
  return (
    <div className="code">
      <div className="tabs" role="tablist">
        {(['changes', 'files'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'changes' ? 'Changes' : 'Files'}
          </button>
        ))}
      </div>
      {tab === 'changes' && repos && repo && <RepoStrip repos={repos} picked={repo} onPick={chooseRepo} />}
      {tab === 'changes' ? <ChangesView key={repo ?? ''} repo={repo ?? undefined} agentId={agentId} agentName={agentName} workDone={workDone} onJump={jump} onOpenChat={onOpenChat} place={inPlace ? (repo ? { branch: repos!.find((r) => r.name === repo)?.branch ?? '' } : place!) : undefined} /> : <FilesView agentId={agentId} agentName={agentName} openFile={request} onOpenChat={onOpenChat} />}
    </div>
  )
}

/** A very long list is cut here, so a branch of hundreds of files does not make the panel slow; search and the status chips reach the rest. */
const ROW_CAP = 400
/** Base-branch notes the user answered "Keep it" to, kept while the app runs so the note does not come back on every refresh. */
const hintOff = new Set<string>()

function ChangesView({ agentId, repo, agentName, workDone, onJump, onOpenChat, place }: { agentId: string; /** A repository inside the folder, when the folder holds several. */ repo?: string; agentName: string; workDone: number; onJump: (j: CodeJump) => void; onOpenChat: () => void; /** Set for an agent working in the folder itself: no branch to compare, only what is uncommitted and the commits since it was hired. */ place?: { branch: string } }) {
  const side = useSideWidth()
  const [data, setData] = useState<Changes | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [find, setFind] = useState('')
  // The list is a tree of folders unless asked for flat; the choice is kept.
  const [view, setView] = useState<'tree' | 'list'>(() => {
    try {
      return localStorage.getItem('aw.changes.view') === 'list' ? 'list' : 'tree'
    } catch {
      return 'tree'
    }
  })
  // Whether the diff folds the code around the changes, and how many lines it keeps: one choice for every file, kept like the tree or list one.
  const [fold, setFold] = useState<Fold>(() => readFold((k) => localStorage.getItem(k)))
  const pickFold = (next: Fold) => {
    setFold(next)
    try {
      localStorage.setItem(FOLD_KEY, next.fold ? 'fold' : 'show')
      localStorage.setItem(CONTEXT_KEY, String(next.context))
    } catch {
      /* the choice just is not kept */
    }
  }
  const foldNow = useRef(fold)
  foldNow.current = fold
  const toggleFold = useRef(() => {})
  toggleFold.current = () => pickFold({ ...foldNow.current, fold: !foldNow.current.fold })
  useEffect(() => diff.current?.updateOptions(foldOptions(fold)), [fold])
  // The key works anywhere on the Changes tab, not only with the editor or the header focused (Monaco takes it itself inside the editor).
  useEffect(() => {
    const key = (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === 'KeyU' && !e.defaultPrevented && (e.preventDefault(), toggleFold.current())
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const pickView = (v: 'tree' | 'list') => {
    setView(v)
    try {
      localStorage.setItem('aw.changes.view', v)
    } catch {
      /* the choice just is not kept */
    }
  }
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<'all' | Changes['files'][number]['status']>('all')
  const [menu, setMenu] = useState(false)
  const [, bump] = useState(0)
  const menuWrap = useRef<HTMLDivElement>(null)
  // The land menu closes on Esc or a click anywhere else.
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => !menuWrap.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), setMenu(false))
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [menu])
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrors()
  // Besides the branch against its base, the column can show what is not committed yet and the branch's commits.
  const [mode, setMode] = useState<ChangeMode>(place ? 'dirty' : 'branch')
  const [commit, setCommit] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [counts, setCounts] = useState<{ dirty: number | null; history: number | null }>({ dirty: null, history: null })
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

  const refresh = useCallback(
    () =>
      void run(async () => {
        if (!place) setData(await window.aw.code.changes(agentId))
        setTick((n) => n + 1)
        // The two other views show their counts on the switch whichever one is open.
        const [st, log] = await Promise.all([window.aw.code.status(agentId, repo), window.aw.code.log(agentId, { scope: 'branch', limit: 1 }, repo)])
        setCounts({ dirty: st.staged.length + st.changed.length + st.untracked.length, history: log.total })
      }),
    [agentId, repo, run, place]
  )
  // Re-read whenever the agent writes or edits another file.
  useEffect(refresh, [refresh, workDone])

  useEffect(() => {
    diff.current = monaco.editor.createDiffEditor(host.current!, { ...editorOptions, readOnly: true, renderSideBySide: false, ...foldOptions(foldNow.current) })
    diff.current.getOriginalEditor().updateOptions({ lineNumbersMinChars: ORIGINAL_NUMBER_CHARS })
    const modified = diff.current.getModifiedEditor()
    // In Monaco's command palette (F1) too, so the choice is reachable from the keyboard without the header.
    modified.addAction({ id: 'aw.foldUnchanged', label: 'Fold or show unchanged code', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyU], run: () => toggleFold.current() })
    // The rows of hidden lines can only be opened with the mouse (the editor gives them no key), so the palette can open every one of them. The widget has the method, the typings do not.
    modified.addAction({ id: 'aw.showHiddenLines', label: 'Show all hidden lines', run: () => (diff.current as unknown as { showAllUnchangedRegions?: () => void } | null)?.showAllUnchangedRegions?.() })
    const asking = attachAsk(modified)
    return () => {
      asking.dispose()
      const m = diff.current?.getModel()
      diff.current?.dispose()
      m?.original.dispose()
      m?.modified.dispose()
    }
  }, [])

  useEffect(() => {
    if (!diff.current) return
    // No file picked (after switching view): nothing is shown, not the last file's diff.
    if (!path) {
      const old = diff.current.getModel()
      diff.current.setModel({ original: monaco.editor.createModel(''), modified: monaco.editor.createModel('') })
      old?.original.dispose()
      old?.modified.dispose()
      return
    }
    void run(async () => {
      const { original, current } = await (mode === 'dirty' ? window.aw.code.dirtyDiff(agentId, path, repo) : mode === 'history' && commit ? window.aw.code.commitDiff(agentId, commit, path, repo) : window.aw.code.diff(agentId, path))
      const lang = languageFor(path)
      const old = diff.current!.getModel()
      diff.current!.setModel({ original: monaco.editor.createModel(original, lang), modified: monaco.editor.createModel(current, lang) })
      old?.original.dispose()
      old?.modified.dispose()
    })
  }, [agentId, path, run, data, mode, commit])

  const pickMode = (m: ChangeMode) => {
    if (m === mode) return
    setMode(m)
    setPath(null)
    setCommit(null)
    setNotice(null)
  }
  // `run` yields undefined only on failure, so success always refreshes and says what happened.
  const act = async (label: string, f: () => Promise<string | void>) => {
    setNotice(null)
    const r = await run(async () => (await f()) ?? '')
    if (r === undefined) return
    setNotice(r ? `${label}: ${r}` : label)
    refresh()
  }

  // What the status chips and the search leave of the changed files.
  const shownFiles = (data?.files ?? []).filter((f) => (status === 'all' || f.status === status) && (!find.trim() || f.path.toLowerCase().includes(find.trim().toLowerCase())))
  // One changed file: its status, the file's name first (and, in the list, the folder it is in after it), and a way to discard it.
  const changed = (f: Changes['files'][number], depth: number) => {
    const name = baseName(f.path)
    const dir = f.path.slice(0, Math.max(0, f.path.length - name.length - 1))
    return (
      <li key={f.path} className={f.path === path ? 'on' : ''} style={depth ? { paddingLeft: depth * 12 } : undefined} role={view === 'tree' ? 'treeitem' : undefined}>
        <button className={`file is-${f.status}`} onClick={() => setPath(f.path)} title={f.path} data-reveal={f.path}>
          <span className="mark">{STATUS_MARK[f.status]}</span>
          <span className="nm">{name}</span>
          {view === 'list' && dir && <span className="dir">{dir}</span>}
        </button>
        <button
          className="discard"
          title={`Discard uncommitted changes to ${f.path}`}
          onClick={() => window.confirm(`Discard uncommitted changes to ${f.path}? This cannot be undone.`) && act('Discarded', () => window.aw.code.discard(agentId, f.path))}
        >
          ✕
        </button>
      </li>
    )
  }

  return (
    <div className="changes" data-reveal-agent={agentId}>
      <div className="change-list ch" style={side.style}>
        <div className="ch-top">
          {place ? (
            <>
              <code className="br" title={place.branch}>{place.branch || '(no commits yet)'}</code>
              <span className="ch-place" title="This agent has no branch of its own: it works in your folder">in your folder</span>
            </>
          ) : data ? <code className="br" title={data.branch ?? ''}>{data.branch}</code> : <span>Loading…</span>}
          <button onClick={refresh} title="Refresh" aria-label="Refresh">
            ↻
          </button>
        </div>
        <ViewSwitch inPlace={!!place} mode={mode} onMode={pickMode} counts={{ branch: data?.files.length ?? null, dirty: counts.dirty, history: counts.history }} />
        {place && mode === 'dirty' && <div className="ch-note" role="note">{agentName} works straight in this folder, so these are all the uncommitted changes in it, not only {agentName}'s.</div>}
        {mode === 'dirty' && (
          <UncommittedList agentId={agentId} repo={repo} tick={tick} path={path} onPick={setPath} onChanged={refresh} view={view} run={run} notice={(t) => setNotice(t)} />
        )}
        {mode === 'history' && (data || place) && (
          <HistoryList agentId={agentId} repo={repo} base={data?.base ?? ''} inPlace={!!place} startedBy={agentName} tick={tick} commit={commit} onCommit={setCommit} path={path} onPick={setPath} view={view} run={run} notice={(t) => setNotice(t)} />
        )}
        {mode !== 'branch' && (notice || error) && (
          <div className="ch-foot ch-status">
            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}
          </div>
        )}
        {mode === 'branch' && (
          <>
        {data && (
          <div className="ch-cmp">
            <span>compared with</span>
            <BasePicker
              value={data.base}
              label="Compared with"
              load={() => window.aw.code.branches(agentId)}
              onPick={async (b) => (await window.aw.code.setBase(agentId, b), refresh())}
              note={`Changes only what ${data.branch} is compared with, and where Merge and PR go. Git itself is not touched.`}
            />
          </div>
        )}
        {data && data.files.length > 0 && (
          <div className="ch-sum" role="group" aria-label="Show">
            <button className={`chipf ${status === 'all' ? 'on' : ''}`} aria-pressed={status === 'all'} onClick={() => setStatus('all')}><b>{data.files.length}</b> file{data.files.length === 1 ? '' : 's'}</button>
            {(['added', 'modified', 'deleted'] as const).map((k) => {
              const n = data.files.filter((f) => f.status === k).length
              return n > 0 && <button key={k} className={`chipf is-${k} ${status === k ? 'on' : ''}`} aria-pressed={status === k} onClick={() => setStatus(status === k ? 'all' : k)} title={{ added: 'New files', modified: 'Changed files', deleted: 'Deleted files' }[k]}><b className="mark">{STATUS_MARK[k]}</b> {n}</button>
            })}
          </div>
        )}
        {data?.hint && !hintOff.has(`${data.base}>${data.hint.branch}`) && (
          <div className="ch-note" role="status">
            <div>
              <b>{data.hint.files === 0 ? `No changes against ${data.hint.branch}.` : `Only ${data.hint.files} file${data.hint.files === 1 ? '' : 's'} differ from ${data.hint.branch}.`}</b> This branch is being compared with <code>{data.base}</code>, which shows {data.files.length} changed.
              <div className="acts">
                <button className="primary" onClick={() => void act(`Now compared with ${data.hint!.branch}`, () => window.aw.code.setBase(agentId, data.hint!.branch))}>Compare with {data.hint.branch}</button>
                <button onClick={() => { hintOff.add(`${data.base}>${data.hint!.branch}`); bump((n) => n + 1) }}>Keep it</button>
              </div>
            </div>
          </div>
        )}
        {data && data.files.length > 0 && (
          <div className="ch-find">
            <input className="change-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search changed files…" aria-label="Search changed files" />
            <span className="change-view" role="group" aria-label="Show changed files as">
              <button aria-pressed={view === 'tree'} className={view === 'tree' ? 'on' : ''} onClick={() => pickView('tree')} title="Show the changed files in their folders">Tree</button>
              <button aria-pressed={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')} title="Show the changed files as one list, file names first">List</button>
            </span>
          </div>
        )}
        <ul className={view === 'tree' ? 'tree' : undefined} role={view === 'tree' ? 'tree' : undefined}>
          {view === 'tree' && data && (() => {
            const byPath = new Map(shownFiles.map((x) => [x.path, x]))
            const rows = changeRows(shownFiles.map((f) => f.path), closed, find)
            return rows.slice(0, ROW_CAP).map((r) => {
              if (!r.dir) return changed(byPath.get(r.path)!, r.depth)
              const shut = closed.has(r.path)
              return (
                <li key={`d:${r.path}`} role="treeitem" aria-expanded={!shut} className="dir-row" style={{ paddingLeft: r.depth * 12 }}>
                  <button className="file" title={r.path} onClick={() => setClosed((c) => { const n = new Set(c); if (!n.delete(r.path)) n.add(r.path); return n })}>
                    <span className="chev">{shut ? '▸' : '▾'}</span>
                    <span className="nm dirname">{r.name}</span>
                    <span className="n">{r.count}</span>
                  </button>
                </li>
              )
            })
          })()}
          {view === 'list' && [...shownFiles].sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), undefined, { sensitivity: 'base', numeric: true })).slice(0, ROW_CAP).map((f) => changed(f, 0))}
          {data && data.files.length === 0 && <li className="empty">No changes yet.</li>}
          {data && data.files.length > 0 && shownFiles.length === 0 && <li className="empty">No changed file matches.</li>}
          {data && shownFiles.length > ROW_CAP && <li className="empty more">…{shownFiles.length - ROW_CAP} more files · refine with search or the A / M / D filters</li>}
        </ul>
        <div className="ch-foot">
          <form
            className="ch-commit"
            onSubmit={(e) => {
              e.preventDefault()
              void act('Committed', async () => {
                await window.aw.code.commit(agentId, message)
                setMessage('')
              })
            }}
          >
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message…" aria-label="Commit message" />
            <button type="submit" disabled={!message.trim()}>
              Commit all
            </button>
          </form>
          <div className="ch-land" ref={menuWrap}>
            <button
              className="main"
              onClick={() => data && window.confirm(`Merge ${data.branch} into ${data.base} in your checkout?`) && act('Merged into', () => window.aw.code.merge(agentId))}
            >
              Merge into {data?.base ?? 'base'}
            </button>
            <button className="caret" aria-haspopup="menu" aria-expanded={menu} aria-label="More ways to finish" title="More ways to finish" onClick={() => setMenu((m) => !m)}>
              ▾
            </button>
            {menu && data && (
              <div className="ch-menu" role="menu">
                <button role="menuitem" onClick={() => (setMenu(false), window.confirm(`Merge ${data.branch} into ${data.base} in your checkout?`) && void act('Merged into', () => window.aw.code.merge(agentId)))}>
                  Merge into {data.base}
                  <small>in your checkout, keeping each commit</small>
                </button>
                <button role="menuitem" onClick={() => (setMenu(false), window.confirm(`Push ${data.branch} to origin and open a pull request against ${data.base}?`) && void act('Pull request', () => window.aw.code.pr(agentId)))}>
                  Push &amp; open PR
                  <small>against {data.base}</small>
                </button>
              </div>
            )}
          </div>
          {notice && <p className="notice">{notice}</p>}
          {error && <p className="error">{error}</p>}
        </div>
          </>
        )}
      </div>
      <SideSizer {...side.sizer} />
      <div className="files-ed">
        {path && (
          <div className="fcrumb">
            <span className="fpath" data-reveal={path} title={path}>{path}</span>
            <span aria-hidden="true">·</span>
            <span className="flang">
              {mode === 'dirty' ? 'uncommitted' : mode === 'history' ? `in commit ${commit?.slice(0, 7) ?? ''}` : `${{ added: 'new file', modified: 'changed', deleted: 'deleted' }[data?.files.find((f) => f.path === path)?.status ?? 'modified']} vs ${data?.base ?? 'base'}`}
            </span>
            <span className="fold-ctl">
              <span className="lab" id="fold-lab">Unchanged code</span>
              <span
                className="change-view"
                role="group"
                aria-labelledby="fold-lab"
                onKeyDown={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (e.preventDefault(), pickFold({ ...fold, fold: e.key === 'ArrowRight' }))}
              >
                <button aria-pressed={!fold.fold} className={fold.fold ? '' : 'on'} onClick={() => pickFold({ ...fold, fold: false })} title="Show all the code of the file">Show</button>
                <button aria-pressed={fold.fold} className={fold.fold ? 'on' : ''} onClick={() => pickFold({ ...fold, fold: true })} title="Fold the code around the changes">Fold</button>
              </span>
              <label className="lab">
                Context{' '}
                <select value={fold.context} onChange={(e) => pickFold({ ...fold, context: Number(e.target.value) as Context })} title="How many lines stay around each change when the code is folded">
                  {CONTEXTS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </span>
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
  const side = useSideWidth()
  const sess = sessionOf(agentId)
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [tabs, setTabs] = useState<TabState>(sess.tabs)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState<string | null>(null)
  // Markdown and html files can be read as the page they make, instead of as source.
  const [previewing, setPreviewing] = useState<Set<string>>(new Set())
  // A page (an html file) or a pdf is shown by the app's own page server, as the Preview tab does; the address changes after a Save so the page is read again.
  const [pageAt, setPageAt] = useState<Record<string, { url: string; n: number }>>({})
  const [reload, setReload] = useState(0)
  const shows = sess.tabs.active ? fileShows(sess.tabs.active) : 'source'
  useEffect(() => {
    const p = sess.tabs.active
    if (!p || (shows !== 'pdf' && !(shows === 'html' && previewing.has(p)))) return
    let alive = true
    void window.aw.fileUrl(agentId, p).then(
      (r) => alive && setPageAt((cur) => ({ ...cur, [p]: { url: r.url, n: reload } })),
      () => undefined
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the file shown, its preview or a Save changes
  }, [sess.tabs.active, shows, previewing, reload, agentId])
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
    const m = p ? model(p) : null
    e.setModel(m)
    if (!p || !m) return
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
      if (fileShows(p) !== 'pdf' && !model(p)) {
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
      setReload((n) => n + 1)
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
    <div className="changes" data-reveal-agent={agentId}>
      <div className="change-list" style={side.style}>
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
                data-reveal={r.path}
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
      <SideSizer {...side.sizer} />
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
                data-reveal={p}
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
            <span className="fpath" data-reveal={active} title={active}>{active}</span>
            <span aria-hidden="true">·</span>
            <span className="flang">{shows === 'pdf' ? 'pdf' : languageFor(active)}</span>
            {(shows === 'markdown' || shows === 'html') && (
              <button
                aria-pressed={previewing.has(active)}
                title={previewing.has(active) ? 'Back to the source' : shows === 'html' ? 'Read it as a page (the file as saved)' : 'Read it as formatted text'}
                onClick={() => setPreviewing((s) => (s.has(active) ? new Set([...s].filter((x) => x !== active)) : new Set(s).add(active)))}
              >
                {previewing.has(active) ? 'Source' : 'Preview'}
              </button>
            )}
            {shows === 'pdf' ? (
              <button title="Open it in the Preview tab" onClick={() => openFileEvent(agentId, active)}>
                Open in Preview
              </button>
            ) : (
              <button onClick={() => void save()} disabled={!dirty} title="Save this file (⌘S)">
                Save{dirty ? ' •' : ''}
              </button>
            )}
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
          {active && shows === 'markdown' && previewing.has(active) && (
            <div className="md-preview" aria-label={`Preview of ${active}`}>
              <Markdown text={model(active)?.getValue() ?? ''} agentId={agentId} />
            </div>
          )}
          {active && ((shows === 'html' && previewing.has(active)) || shows === 'pdf') && (
            <div className="md-preview page-frame">
              {pageAt[active] &&
                (shows === 'pdf' ? (
                  // The browser's PDF viewer crashes the page when it opens in a frame of the app's own window; in a webview, as the Preview tab uses, it is fine.
                  <webview key={`${active}:${pageAt[active]!.n}`} title={baseName(active)} src={pageAt[active]!.url} partition="preview" />
                ) : (
                  // A page runs in a sandbox of its own: scripts yes, the app and its storage no.
                  <iframe key={`${active}:${pageAt[active]!.n}`} title={`Preview of ${active}`} src={pageAt[active]!.url} sandbox="allow-scripts allow-forms allow-popups" />
                ))}
            </div>
          )}
          <div className="diff" ref={host} style={active && (shows === 'pdf' || ((shows === 'markdown' || shows === 'html') && previewing.has(active))) ? { visibility: 'hidden' } : undefined} aria-label={active ? (shows === 'pdf' ? `Editor (${active} is a PDF)` : `Editing ${active}`) : 'Editor'} data-hint={active ? undefined : 'Pick a file to edit it'} />
          {ask.view}
        </div>
        <ContextTray agentId={agentId} onJump={(j) => open(j.path, { from: j.from, to: j.to })} onOpenChat={onOpenChat} />
      </div>
    </div>
  )
}
