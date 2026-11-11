import { useEffect, useState } from 'react'
import { needsConfirm, type Described, type McpServer, type ProbeResult } from '../../shared/mcp'
import { clean, ConfirmRun, ProbeLine } from './McpBits'

const TEMPLATE = '{\n  "type": "stdio",\n  "command": "",\n  "args": [],\n  "env": {}\n}'
type Target = 'claude' | 'project' | 'agy'

/**
 * An entry as its own file has it, to read and change as JSON: the names of its variables and headers are there and their values are masked, a value left masked is kept and a value
 * typed over it is the new one. With no `server` it is a new entry. Test connection starts the entry as typed, before anything is saved.
 */
export function McpEntry({ server, folder, onSaved, onRemoved }: { server?: McpServer; folder?: string; onSaved: (id: string) => void; onRemoved: () => void }) {
  const [file, setFile] = useState('')
  const [json, setJson] = useState(server ? '' : TEMPLATE)
  const [saved, setSaved] = useState('')
  const [name, setName] = useState(server?.name ?? '')
  const [target, setTarget] = useState<Target>('claude')
  const [editable, setEditable] = useState(!server)
  const [fail, setFail] = useState('')
  const [test, setTest] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'remove'>('')
  const [sure, setSure] = useState(false)
  const [masked, setMasked] = useState(true)
  // An entry that comes with a project is run only after the person has been shown what the office worked out it would run.
  const [ask, setAsk] = useState<Described | null>(null)
  useEffect(() => {
    setFail('')
    setTest(null)
    setSure(false)
    setAsk(null)
    if (!server) return
    let live = true
    void window.aw.library.mcpEntry(server.id).then(
      (e) => live && (setJson(e.json), setSaved(e.json), setFile(e.file), setName(e.name), setEditable(e.editable), setMasked(e.masked)),
      (e: unknown) => live && setFail(clean(e))
    )
    return () => void (live = false)
  }, [server?.id])
  const valid = (() => {
    try {
      return typeof JSON.parse(json) === 'object'
    } catch {
      return false
    }
  })()
  const run = (what: 'test' | 'save' | 'remove', f: () => Promise<void>) => {
    setBusy(what)
    setFail('')
    void f().then(() => setBusy(''), (e: unknown) => (setFail(clean(e)), setBusy('')))
  }
  const dirty = json !== saved || (!!server && name !== server.name)
  return (
    <div className="lip-tp"><div className="sk2-over">
      <section>
        {!server && (
          <>
            <h5>New server</h5>
            <div className="mt-fld"><label htmlFor="mt-name">Name</label><input id="mt-name" value={name} placeholder="for example supabase" onChange={(e) => setName(e.target.value)} /></div>
            <div className="mt-fld">
              <label>Where it is kept</label>
              <span className="mt-seg2" role="group" aria-label="Where it is kept">
                <button className={target === 'claude' ? 'on' : ''} aria-pressed={target === 'claude'} onClick={() => setTarget('claude')}>Everywhere (~/.claude.json)</button>
                <button className={target === 'project' ? 'on' : ''} aria-pressed={target === 'project'} disabled={!folder} title={folder ? undefined : 'Open a project to keep it in its .mcp.json'} onClick={() => setTarget('project')}>This project (.mcp.json)</button>
                <button className={target === 'agy' ? 'on' : ''} aria-pressed={target === 'agy'} onClick={() => setTarget('agy')}>agy CLI</button>
              </span>
            </div>
          </>
        )}
        {server && (
          <>
            <h5>The entry</h5>
            <div className="mt-fld"><label htmlFor="mt-name">Name</label><input id="mt-name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} /></div>
            <p className="hint mt-where">In <span className="mono" title={file}>{file}</span>{server.project ? ` · ${server.project}` : ''}</p>
          </>
        )}
        <div className="mt-fld">
          <label htmlFor="mt-json">{server ? 'Entry (JSON)' : 'Entry (JSON)'}</label>
          <textarea id="mt-json" className="mt-json" spellCheck={false} value={json} readOnly={!editable} onChange={(e) => (setJson(e.target.value), setTest(null))} rows={12} />
          <p className={`mt-valid ${valid ? 'ok' : 'bad'}`}>{valid ? (masked ? '✓ valid JSON · a value shown as •••••••• is kept as it is unless you type over it' : '✓ valid JSON · this entry comes with the project, so its values are shown whole') : 'Not valid JSON yet'}</p>
        </div>
        {fail && <p className="error" role="alert">{fail}</p>}
        {ask && server && (
          <ConfirmRun name={server.name} file={file || server.path} d={ask} onCancel={() => setAsk(null)}
            onRun={() => (setAsk(null), run('test', async () => setTest(await window.aw.library.testMcp({ id: server.id, json, digest: ask.digest }))))} />
        )}
        {test && <ProbeLine probe={test} />}
        {test?.status === 'connected' && <p className="hint">Connected: {test.tools.length} {test.tools.length === 1 ? 'tool' : 'tools'}. Save, then open Tools to read them.</p>}
        <div className="su-row mt-actions">
          <button disabled={!valid || !!busy} onClick={() => run('test', async () => {
            if (server && needsConfirm(server)) return setAsk(await window.aw.library.mcpDescribe({ id: server.id, json }))
            setTest(await window.aw.library.testMcp({ ...(server && { id: server.id }), json }))
          })}>{busy === 'test' ? 'Connecting…' : 'Test connection'}</button>
          {editable && <button className="primary" disabled={!valid || !!busy || !name.trim() || (!!server && !dirty)} onClick={() => run('save', async () => onSaved((await window.aw.library.saveMcp({ ...(server ? { id: server.id } : { target, ...(folder && { folder }) }), name: name.trim(), json })).id))}>{busy === 'save' ? 'Saving…' : 'Save'}</button>}
          {server && editable && dirty && <button onClick={() => (setJson(saved), setName(server.name), setFail(''), setTest(null))}>Revert</button>}
          <span className="lib-sp" />
          {server && editable && (sure ? (
            <>
              <button className="danger sm" disabled={!!busy} onClick={() => run('remove', async () => (await window.aw.library.removeMcp(server.id), onRemoved()))}>Yes, remove it</button>
              <button className="sm" onClick={() => setSure(false)}>Cancel</button>
            </>
          ) : <button className="ghost sm" onClick={() => setSure(true)}>Remove…</button>)}
        </div>
        <p className="hint skw-note">{editable || !server ? 'Saved straight into the file; the old text is kept beside it as .aw-bak. Nothing is started until you press Test connection.' : 'This list is read only here.'}</p>
      </section>
    </div></div>
  )
}
