import { useCallback, useEffect, useRef, useState } from 'react'
import type { Changes } from '../../shared/api'
import { editorOptions, languageFor, monaco } from './monaco'

type Tab = 'changes' | 'files'
/** Ask the Files tab to open a file; a new object each time so asking twice works. */
export interface OpenRequest {
  path: string
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
export function CodePanel({ agentId, workDone, openFile }: { agentId: string; workDone: number; openFile?: OpenRequest }) {
  const [tab, setTab] = useState<Tab>(openFile ? 'files' : 'changes')
  useEffect(() => {
    if (openFile) setTab('files')
  }, [openFile])
  return (
    <div className="code">
      <div className="tabs" role="tablist">
        {(['changes', 'files'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === 'changes' ? 'Changes' : 'Files'}
          </button>
        ))}
      </div>
      {tab === 'changes' ? <ChangesView agentId={agentId} workDone={workDone} /> : <FilesView agentId={agentId} openFile={openFile} />}
    </div>
  )
}

function ChangesView({ agentId, workDone }: { agentId: string; workDone: number }) {
  const [data, setData] = useState<Changes | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const { error, run } = useErrors()
  const host = useRef<HTMLDivElement>(null)
  const diff = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  const refresh = useCallback(() => void run(async () => setData(await window.aw.code.changes(agentId))), [agentId, run])
  // Re-read whenever the agent writes or edits another file.
  useEffect(refresh, [refresh, workDone])

  useEffect(() => {
    diff.current = monaco.editor.createDiffEditor(host.current!, { ...editorOptions, readOnly: true, renderSideBySide: false })
    return () => {
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
      <div className="diff" ref={host} aria-label={path ? `Diff of ${path}` : 'Diff'} />
    </div>
  )
}

function FilesView({ agentId, openFile }: { agentId: string; openFile?: OpenRequest }) {
  const [files, setFiles] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const { error, run } = useErrors()
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const current = useRef<string | null>(null)

  useEffect(() => void run(async () => setFiles(await window.aw.code.files(agentId))), [agentId, run])

  const save = useCallback(async () => {
    if (!current.current || !editor.current) return
    const p = current.current
    await run(async () => {
      await window.aw.code.write(agentId, p, editor.current!.getValue())
      setDirty(false)
    })
  }, [agentId, run])

  useEffect(() => {
    editor.current = monaco.editor.create(host.current!, { ...editorOptions, value: '' })
    editor.current.onDidChangeModelContent(() => setDirty(true))
    return () => {
      editor.current?.getModel()?.dispose()
      editor.current?.dispose()
    }
  }, [])

  useEffect(() => {
    const e = editor.current
    if (!e) return
    const binding = e.addAction({ id: 'aw.save', label: 'Save', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => void save() })
    return () => binding.dispose()
  }, [save])

  const open = (p: string) =>
    void run(async () => {
      if (dirty && !window.confirm(`Discard unsaved edits to ${current.current}?`)) return
      const text = await window.aw.code.read(agentId, p)
      const old = editor.current!.getModel()
      editor.current!.setModel(monaco.editor.createModel(text, languageFor(p)))
      old?.dispose()
      current.current = p
      setPath(p)
      setDirty(false)
    })

  useEffect(() => {
    if (openFile) open(openFile.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request should open a file
  }, [openFile])

  const shown = files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="changes">
      <div className="change-list">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter files" aria-label="Filter files" />
        <ul>
          {shown.map((f) => (
            <li key={f} className={f === path ? 'on' : ''}>
              <button className="file" onClick={() => open(f)} title={f}>
                <span className="dir">{f.includes('/') ? f.slice(0, f.lastIndexOf('/') + 1) : ''}</span>
                {f.slice(f.lastIndexOf('/') + 1)}
              </button>
            </li>
          ))}
        </ul>
        <div className="land">
          <button onClick={() => void save()} disabled={!path || !dirty}>
            Save{dirty ? ' •' : ''}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <div className="diff" ref={host} aria-label={path ? `Editing ${path}` : 'Editor'} />
    </div>
  )
}
