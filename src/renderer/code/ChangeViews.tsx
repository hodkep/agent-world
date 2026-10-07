import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeStatus, CommitDetail, CommitInfo, WorktreeStatus } from '../../shared/api'
import { agoLabel } from '../profile/format'
import { changeRows } from './tree'

const MARK = { added: 'A', modified: 'M', deleted: 'D' } as const
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const dirName = (p: string) => p.slice(0, Math.max(0, p.length - baseName(p).length - 1))
type File = { path: string; status: ChangeStatus }

export type ChangeMode = 'branch' | 'dirty' | 'history'

/** What the Changes column shows: the branch against its base, what is not committed yet, or the branch's commits. */
export function ViewSwitch({ mode, onMode, counts }: { mode: ChangeMode; onMode: (m: ChangeMode) => void; counts: Record<ChangeMode, number | null> }) {
  // In a narrow column the middle one is "Pending" and the counts go into the tooltips.
  const items: [ChangeMode, string, string][] = [
    ['branch', 'Branch', 'What this branch changes compared with its base'],
    ['dirty', 'Uncommitted', 'Changes in the worktree that are not committed yet'],
    ['history', 'History', "The branch's commits"]
  ]
  return (
    <div className="ch-switch" role="group" aria-label="What to show">
      {items.map(([k, label, tip]) => (
        <button key={k} className={mode === k ? 'on' : ''} aria-pressed={mode === k} aria-label={counts[k] === null ? label : `${label} ${counts[k]}`} title={counts[k] === null ? tip : `${tip} (${counts[k]})`} onClick={() => onMode(k)}>
          <span className="full">{label}</span>
          <span className="short" aria-hidden="true">{k === 'dirty' ? 'Pending' : label}</span>
          {counts[k] !== null && <span className="n">{counts[k]}</span>}
        </button>
      ))}
    </div>
  )
}

/** The files of one group as a tree of folders or a flat list, each with its own buttons. */
function Files({ group, files, view, closed, toggle, path, onPick, actions }: { group: string; files: File[]; view: 'tree' | 'list'; closed: Set<string>; toggle: (key: string) => void; path: string | null; onPick: (p: string) => void; actions: (f: File) => React.ReactNode }) {
  const row = (f: File, depth: number) => (
    <li key={`${group}:${f.path}`} className={f.path === path ? 'on' : ''} style={depth ? { paddingLeft: depth * 12 } : undefined} role={view === 'tree' ? 'treeitem' : undefined}>
      <button className={`file is-${f.status}`} onClick={() => onPick(f.path)} title={f.path}>
        <span className="mark">{MARK[f.status]}</span>
        <span className="nm">{baseName(f.path)}</span>
        {view === 'list' && dirName(f.path) && <span className="dir">{dirName(f.path)}</span>}
      </button>
      {actions(f)}
    </li>
  )
  if (view === 'list') return <>{[...files].sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), undefined, { sensitivity: 'base', numeric: true })).map((f) => row(f, 0))}</>
  const mine = new Set([...closed].filter((k) => k.startsWith(`${group}\0`)).map((k) => k.slice(group.length + 1)))
  const byPath = new Map(files.map((f) => [f.path, f]))
  return (
    <>
      {changeRows(
        files.map((f) => f.path),
        mine,
        ''
      ).map((r) =>
        r.dir ? (
          <li key={`${group}:d:${r.path}`} role="treeitem" aria-expanded={!mine.has(r.path)} className="dir-row" style={{ paddingLeft: r.depth * 12 }}>
            <button className="file" title={r.path} onClick={() => toggle(`${group}\0${r.path}`)}>
              <span className="chev">{mine.has(r.path) ? '▸' : '▾'}</span>
              <span className="nm dirname">{r.name}</span>
              <span className="n">{r.count}</span>
            </button>
          </li>
        ) : (
          row(byPath.get(r.path)!, r.depth)
        )
      )}
    </>
  )
}

/** The worktree's uncommitted files: staged, edited and new, with a button on each row to stage, unstage or discard it, and a commit line for what is staged. */
export function UncommittedList(p: {
  agentId: string
  tick: number
  path: string | null
  onPick: (path: string | null) => void
  /** Something was staged, committed or discarded: the diff and the counts are read again. */
  onChanged: () => void
  view: 'tree' | 'list'
  run: <T>(f: () => Promise<T>) => Promise<T | undefined>
  notice: (text: string) => void
}) {
  const { agentId, tick, path, onPick, onChanged, view, run, notice } = p
  const [status, setStatus] = useState<WorktreeStatus | null>(null)
  const [find, setFind] = useState('')
  const [message, setMessage] = useState('')
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setClosed((c) => { const n = new Set(c); if (!n.delete(k)) n.add(k); return n })

  const load = useCallback(() => void run(async () => setStatus(await window.aw.code.status(agentId))), [agentId, run])
  useEffect(load, [load, tick])

  const q = find.trim().toLowerCase()
  const keep = (list: File[]) => list.filter((f) => !q || f.path.toLowerCase().includes(q))
  const staged = status?.staged ?? []
  const total = staged.length + (status?.changed.length ?? 0) + (status?.untracked.length ?? 0)
  const act = async (label: string, f: () => Promise<void>) => {
    const done = await run(async () => (await f(), true))
    if (done) (notice(label), onChanged(), load())
  }
  const paths = (l: File[]) => l.map((f) => f.path)

  const group = (key: string, name: string, list: File[], all: [string, () => void], actions: (f: File) => React.ReactNode) => {
    const shown = keep(list)
    if (!list.length) return null
    return (
      <>
        <li className="ch-group" role="presentation">
          <span>{name}</span>
          <span className="n">{list.length}</span>
          <button onClick={all[1]}>{all[0]}</button>
        </li>
        <Files group={key} files={shown} view={view} closed={closed} toggle={toggle} path={path} onPick={onPick} actions={actions} />
      </>
    )
  }
  const discard = (f: File, fresh: boolean) => (
    <button className="discard" title={fresh ? `Delete the new file ${f.path}` : `Discard uncommitted changes to ${f.path}`} aria-label={fresh ? `Delete ${f.path}` : `Discard changes to ${f.path}`} onClick={() => window.confirm(fresh ? `Delete the new file ${f.path}? This cannot be undone.` : `Discard uncommitted changes to ${f.path}? This cannot be undone.`) && void act(fresh ? 'Deleted' : 'Discarded', () => window.aw.code.discard(agentId, f.path))}>
      ✕
    </button>
  )
  const plus = (f: File) => (
    <button className="rowact" title={`Stage ${f.path}`} aria-label={`Stage ${f.path}`} onClick={() => void act('Staged', () => window.aw.code.stage(agentId, [f.path]))}>
      +
    </button>
  )

  return (
    <>
      {status && total > 0 && (
        <>
          <div className="ch-sum" role="group" aria-label="Uncommitted files">
            <span className="chipf on"><b>{total}</b> file{total === 1 ? '' : 's'}</span>
            <span className="chipf is-added"><b>{status.staged.length}</b> staged</span>
            <span className="chipf is-modified"><b>{status.changed.length}</b> changed</span>
            <span className="chipf is-new"><b>{status.untracked.length}</b> new</span>
          </div>
          <div className="ch-find">
            <input className="change-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search uncommitted files…" aria-label="Search uncommitted files" />
          </div>
        </>
      )}
      <ul className={view === 'tree' ? 'tree' : undefined} role={view === 'tree' ? 'tree' : undefined} aria-label="Uncommitted files">
        {status &&
          group('staged', 'Staged', status.staged, ['Unstage all', () => void act('Unstaged', () => window.aw.code.unstage(agentId, paths(status.staged)))], (f) => (
            <button className="rowact" title={`Unstage ${f.path}`} aria-label={`Unstage ${f.path}`} onClick={() => void act('Unstaged', () => window.aw.code.unstage(agentId, [f.path]))}>
              −
            </button>
          ))}
        {status &&
          group('changed', 'Changes', status.changed, ['Stage all', () => void act('Staged', () => window.aw.code.stage(agentId, paths(status.changed)))], (f) => (
            <>
              {plus(f)}
              {discard(f, false)}
            </>
          ))}
        {status &&
          group('untracked', 'New files', status.untracked, ['Stage all', () => void act('Staged', () => window.aw.code.stage(agentId, paths(status.untracked)))], (f) => (
            <>
              {plus(f)}
              {discard(f, true)}
            </>
          ))}
        {status && total === 0 && (
          <li className="empty clean">
            <b>Nothing uncommitted.</b> Everything this agent changed is committed.
          </li>
        )}
        {status && total > 0 && q && keep([...status.staged, ...status.changed, ...status.untracked]).length === 0 && <li className="empty">No uncommitted file matches.</li>}
      </ul>
      <div className="ch-foot">
        <form
          className="ch-commit"
          onSubmit={(e) => {
            e.preventDefault()
            void act('Committed', async () => {
              await (staged.length > 0 ? window.aw.code.commitStaged(agentId, message) : window.aw.code.commit(agentId, message))
              setMessage('')
            })
          }}
        >
          <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message…" aria-label="Commit message" />
          <button type="submit" className={staged.length > 0 ? 'primary' : ''} disabled={!message.trim() || total === 0}>
            {staged.length > 0 ? `Commit ${staged.length} staged` : 'Commit all'}
          </button>
        </form>
        {total > 0 && <p className="ch-hint">{staged.length > 0 ? 'Only the staged files are committed.' : 'Nothing is staged, so Commit all takes every change above, new files included.'}</p>}
      </div>
    </>
  )
}

const PAGE = 50

/** The branch's commits, newest first, a search over them, and one commit's files when it is opened. */
export function HistoryList(p: {
  agentId: string
  base: string
  tick: number
  commit: string | null
  onCommit: (hash: string | null) => void
  path: string | null
  onPick: (path: string | null) => void
  view: 'tree' | 'list'
  run: <T>(f: () => Promise<T>) => Promise<T | undefined>
  notice: (text: string) => void
}) {
  const { agentId, base, tick, commit, onCommit, path, onPick, view, run, notice } = p
  const [scope, setScope] = useState<'branch' | 'all'>('branch')
  const [find, setFind] = useState('')
  const [query, setQuery] = useState('')
  const [list, setList] = useState<CommitInfo[] | null>(null)
  const [total, setTotal] = useState(0)
  const [more, setMore] = useState(false)
  const [branchTotal, setBranchTotal] = useState<number | null>(null)
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setClosed((c) => { const n = new Set(c); if (!n.delete(k)) n.add(k); return n })
  const seq = useRef(0)

  // The search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => setQuery(find.trim()), 250)
    return () => clearTimeout(t)
  }, [find])

  useEffect(() => {
    const mine = ++seq.current
    void run(async () => {
      const page = await window.aw.code.log(agentId, { scope, search: query, limit: PAGE })
      if (mine !== seq.current) return
      setList(page.commits)
      setTotal(page.total)
      setMore(page.more)
      if (scope === 'branch' && !query) setBranchTotal(page.total)
    })
  }, [agentId, scope, query, tick, run])
  useEffect(() => {
    if (branchTotal === null) void window.aw.code.log(agentId, { scope: 'branch', limit: 1 }).then((p) => setBranchTotal(p.total), () => {})
  }, [agentId, branchTotal, tick])

  const older = () =>
    void run(async () => {
      const page = await window.aw.code.log(agentId, { scope, search: query, limit: PAGE, skip: list?.length ?? 0 })
      setList((cur) => [...(cur ?? []), ...page.commits])
      setMore(page.more)
    })

  useEffect(() => {
    setDetail(null)
    if (commit) void run(async () => setDetail(await window.aw.code.commitDetail(agentId, commit)))
  }, [agentId, commit, run])

  if (commit) {
    const c = list?.find((x) => x.hash === commit)
    const files = detail?.files ?? []
    const count = (s: ChangeStatus) => files.filter((f) => f.status === s).length
    return (
      <>
        <button className="ch-back" onClick={() => (onCommit(null), onPick(null))}>
          ← History
        </button>
        <div className="ch-detail">
          <h3>{detail?.subject ?? c?.subject ?? '…'}</h3>
          <div className="ch-meta">
            <code className="hash">{commit.slice(0, 7)}</code>
            <span>{detail?.author ?? c?.author}</span>
            {(detail?.at ?? c?.at) && <span title={new Date(detail?.at ?? c!.at).toLocaleString()}>{agoLabel(detail?.at ?? c!.at, Date.now())}</span>}
            {c && (
              <span className="stat">
                <span className="plus">+{c.added}</span> <span className="minus">−{c.deleted}</span>
              </span>
            )}
          </div>
          {detail?.body && <p>{detail.body}</p>}
          <div className="ch-acts">
            <button onClick={() => void navigator.clipboard.writeText(commit).then(() => notice('Copied the commit hash'))}>Copy hash</button>
          </div>
        </div>
        {detail && (
          <div className="ch-sum" role="group" aria-label="Files in this commit">
            <span className="chipf on"><b>{files.length}</b> file{files.length === 1 ? '' : 's'}</span>
            {(['added', 'modified', 'deleted'] as const).map((k) => count(k) > 0 && <span key={k} className={`chipf is-${k}`}><b className="mark">{MARK[k]}</b> {count(k)}</span>)}
          </div>
        )}
        <ul className={view === 'tree' ? 'tree' : undefined} role={view === 'tree' ? 'tree' : undefined} aria-label="Files in this commit">
          {detail && <Files group="commit" files={files} view={view} closed={closed} toggle={toggle} path={path} onPick={onPick} actions={() => null} />}
          {detail && files.length === 0 && <li className="empty">This commit changed no files.</li>}
        </ul>
      </>
    )
  }

  return (
    <>
      <div className="ch-find ch-scope">
        <span className="change-view" role="group" aria-label="Which commits">
          <button className={scope === 'branch' ? 'on' : ''} aria-pressed={scope === 'branch'} onClick={() => setScope('branch')} title={`Only the commits since this branch left ${base}`}>
            Since {base}
            {branchTotal !== null ? ` · ${branchTotal}` : ''}
          </button>
          <button className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => setScope('all')} title="Every commit that leads to this branch">
            All
          </button>
        </span>
      </div>
      <div className="ch-find">
        <input className="change-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search message, author or hash…" aria-label="Search commits" />
      </div>
      <ul className="commits" aria-label="Commits">
        {list?.map((c) => (
          <li key={c.hash}>
            <button className="commit" onClick={() => (onCommit(c.hash), onPick(null))} title={`${c.hash}\n${new Date(c.at).toLocaleString()}`}>
              <span className={`dot ${c.head ? 'head' : ''}`} aria-hidden="true" />
              <span className="subject">{c.subject}</span>
              <span className="ch-meta">
                <code className="hash">{c.short}</code>
                <span>
                  {c.author} · {agoLabel(c.at, Date.now())}
                </span>
                <span className="stat">
                  {c.files} file{c.files === 1 ? '' : 's'} <span className="plus">+{c.added}</span> <span className="minus">−{c.deleted}</span>
                </span>
                {c.head && <span className="tagc">HEAD</span>}
                {c.local && <span className="tagc local" title="Not pushed yet">LOCAL</span>}
              </span>
            </button>
          </li>
        ))}
        {list && scope === 'branch' && !query && !more && list.length > 0 && <li className="commit-base">branch starts here · {base}</li>}
        {list && list.length === 0 && <li className="empty">{query ? 'No commit matches.' : scope === 'branch' ? `No commits since ${base} yet.` : 'No commits.'}</li>}
        {list && more && (
          <li className="empty more">
            <button onClick={older}>Show older commits{total ? ` (${total - list.length} more)` : ''}</button>
          </li>
        )}
      </ul>
    </>
  )
}
