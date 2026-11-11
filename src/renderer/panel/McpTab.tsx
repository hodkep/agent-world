import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupServers, type McpReport, type McpServer, type ProbeResult, type ToolUsage } from '../../shared/mcp'
import { Bars, clean, StatusChip, Switch } from './McpBits'
import { McpEntry } from './McpEntry'
import { McpToolsTable } from './McpToolsTable'
import { alsoIn, rowState } from './mcpView'

const COLOUR: Record<McpServer['where'], string> = { office: '#f2c230', global: '#5f9e5f', project: '#6ad0e0', plugin: '#a4a2b8', 'agy-cli': '#e07aa8', 'agy-ide': '#a4a2b8' }
const none: ToolUsage = { tools: {}, servers: {} }
type Reader = 'overview' | 'tools' | 'entry'

/** The MCP servers the programs' own files list, as the Skills shelf lists skills: a panel for each place, a row for each server with its status, a reader for the open one. */
export function McpTab({ folder }: { folder?: string }) {
  const [rep, setRep] = useState<McpReport | null>(null)
  const [usage, setUsage] = useState<ToolUsage>(none)
  const [find, setFind] = useState('')
  const [open, setOpen] = useState<string | 'new' | null>(null)
  const [fail, setFail] = useState('')
  const [reader, setReader] = useState<Reader>('overview')
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({})
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const load = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([window.aw.library.mcp(), window.aw.library.toolUsage()])
      setRep(r)
      setUsage(u)
      setProbes(r.probes ?? {})
      setFail('')
    } catch (e) {
      setFail(clean(e))
    }
  }, [])
  useEffect(() => void load(), [load])
  const set = (name: string, on: boolean) =>
    void window.aw.library.setMcp(name, on).then(
      // Turning one on may also clear the flag its own file had, so the list is read again.
      () => (setFail(''), on ? void load() : setRep((r) => r && { ...r, off: [...new Set([...r.off, name])] })),
      (e: unknown) => setFail(clean(e))
    )
  const connect = (s: McpServer) => {
    setBusy((b) => new Set(b).add(s.id))
    return window.aw.library.connectMcp(s.id).then(
      (r) => setProbes((p) => ({ ...p, [s.id]: r })),
      (e: unknown) => setFail(clean(e))
    ).finally(() => setBusy((b) => (b.delete(s.id), new Set(b))))
  }
  const connectAll = () => void Promise.all((rep?.servers ?? []).filter((s) => s.where !== 'office' && !busy.has(s.id)).map(connect))
  const servers = useMemo(() => (rep?.servers ?? []).filter((s) => !find.trim() || `${s.name} ${s.fact}`.toLowerCase().includes(find.trim().toLowerCase())), [rep, find])
  const groups = useMemo(() => groupServers(servers), [servers])
  const off = rep?.off ?? []
  const current = open && open !== 'new' ? rep?.servers.find((s) => s.id === open) : undefined
  const on = (rep?.servers ?? []).filter((s) => rowState(s, off) === 'on').length
  const switchable = (rep?.servers ?? []).filter((s) => ['on', 'off'].includes(rowState(s, off))).length
  const connected = Object.values(probes).filter((p) => p.status === 'connected').length
  const bad = Object.values(probes).filter((p) => p.status === 'failed' || p.status === 'timeout').length
  return (
    <div role="tabpanel" id="lib-panel-mcp" aria-labelledby="lib-tab-mcp" className="lib-panel lib-panel-shelf">
      <div className="lib-col">
        <div className="lib-bar" role="group" aria-label="MCP servers">
          <input aria-label="Find a server" placeholder="Find a server…" value={find} onChange={(e) => setFind(e.target.value)} />
          <span className="lib-sp" />
          <button onClick={() => void load()}>Refresh</button>
          <button disabled={busy.size > 0 || !rep} title="Start each server and read what it answers" onClick={connectAll}>Connect all</button>
          <button className="primary" onClick={() => (setOpen('new'), setReader('entry'))}>Add server…</button>
        </div>
        {rep && <p className="lib-sum"><span className="hint">{rep.servers.length} {rep.servers.length === 1 ? 'server' : 'servers'} · {on} on for Claude agents of {switchable} you can switch{connected + bad > 0 ? ` · ${connected} connected${bad ? ` · ${bad} failed` : ''}` : ''} · the number is calls in 30 days</span></p>}
        {fail && <p className="error" role="alert">{fail}</p>}
        <section className="drawer sk2" aria-label="MCP servers">
          <div className="sk2-list lib-scrollbar">
            {groups.map((g) => (
              <div key={g.key} className="sk2-pnl" role="group" aria-label={g.title}>
                <div className="sk2-grp"><b>{g.title}</b><span className="sk2-path" title={g.path}>{g.path}</span><span className="sk2-tot">{g.rows.length}</span></div>
                {g.rows.map((s) => {
                  const st = rowState(s, off)
                  // Calls are counted by Claude agents' server names: they say nothing about agy's own lists.
                  const n = s.where === 'agy-cli' || s.where === 'agy-ide' ? 0 : (usage.servers[s.name]?.n ?? 0)
                  const p = probes[s.id]
                  return (
                    <div key={s.id} className={`sk2-row mt-row${open === s.id ? ' sel' : ''}${st === 'off' || st === 'ownoff' ? ' off' : ''}${s.readOnly && s.where !== 'office' && s.where !== 'agy-cli' ? ' ro' : ''}`}>
                      <button className="mt-pick" aria-label={`Open ${s.name}`} aria-pressed={open === s.id} onClick={() => (setOpen(s.id), setReader('overview'))}>
                        <span className="sk2-spine" style={{ background: COLOUR[s.where] }} aria-hidden />
                        <span className="sk2-main"><b>{s.name}</b><small>{s.transport}{s.fact ? ` · ${s.fact}` : ''}{st === 'ownoff' ? ' · off in its own file' : ''}</small></span>
                      </button>
                      <span className="mt-tail">
                        {s.where !== 'office' && !p && !busy.has(s.id) && <button className="sm" aria-label={`Connect ${s.name}`} onClick={() => void connect(s)}>Connect</button>}
                        {s.where !== 'office' && <StatusChip probe={p} busy={busy.has(s.id)} />}
                        <span className="sk2-size">{n || '–'}</span>
                        {st === 'locked' ? <span className="sk2-chip">locked</span> : st === 'readonly' ? <span className="sk2-chip">{s.where === 'agy-cli' ? 'agy’s list' : 'read only'}</span> : <Switch on={st === 'on'} label={`${s.name} for Claude agents`} onChange={(v) => set(s.name, v)} />}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))}
            {rep && groups.length === 0 && <p className="hint">Nothing matches.</p>}
          </div>
        </section>
      </div>
      <div className="lib-read">
        {open === 'new' ? (
          <div className="lip" role="group" aria-label="New server">
            <div className="lip-top"><div className="lip-title"><b>New server</b></div><p className="lip-desc">Write its entry, test it, then save it into the file.</p></div>
            <McpEntry folder={folder} onSaved={(id) => void load().then(() => (setOpen(id || null), setReader('overview')))} onRemoved={() => undefined} />
          </div>
        ) : current ? (
          <ServerReader key={current.id} s={current} all={rep!.servers} off={off} usage={usage} probe={probes[current.id]} busy={busy.has(current.id)} folder={folder} reader={reader} onReader={setReader} onSet={set} onConnect={() => void connect(current)}
            onSaved={(id) => void load().then(() => setOpen(id || null))} onRemoved={() => void load().then(() => setOpen(null))} />
        ) : <p className="hint">Pick a server to see where it lives, whether it connects, and the tools it offers.</p>}
      </div>
    </div>
  )
}

function ServerReader({ s, all, off, usage, probe, busy, folder, reader, onReader, onSet, onConnect, onSaved, onRemoved }: { s: McpServer; all: McpServer[]; off: string[]; usage: ToolUsage; probe?: ProbeResult; busy: boolean; folder?: string; reader: Reader; onReader: (r: Reader) => void; onSet: (name: string, on: boolean) => void; onConnect: () => void; onSaved: (id: string) => void; onRemoved: () => void }) {
  const st = rowState(s, off)
  const also = alsoIn(s, all)
  const used = usage.servers[s.name]
  const claude = s.where === 'global' || s.where === 'project'
  const tools = probe?.status === 'connected' ? probe.tools : []
  const TABS: [Reader, string][] = [['overview', 'Overview'], ['tools', `Tools${tools.length ? ` (${tools.length})` : ''}`], ['entry', 'Entry (JSON)']]
  return (
    <div className="lip" role="group" aria-label={`${s.name} in detail`}>
      <div className="lip-top">
        <div className="lip-title mt-title"><b>{s.name}</b>{s.where !== 'office' && <span className="mt-head"><StatusChip probe={probe} busy={busy} /><button className="sm" disabled={busy} onClick={onConnect}>{probe ? 'Reconnect' : 'Connect'}</button></span>}</div>
        <p className="lip-desc">{s.transport}{s.fact ? ` · ${s.fact}` : ''}</p>
        {probe && probe.status !== 'connected' && <p className="mt-why" role="alert">{probe.message}</p>}
        {probe?.status === 'connected' && probe.server && <p className="hint mt-srv">{probe.server.name} {probe.server.version} · connected in {(probe.ms / 1000).toFixed(1)} s</p>}
      </div>
      <div className="lip-tabs" role="tablist" aria-label={`About ${s.name}`}>
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={reader === id} className={reader === id ? 'on' : ''} onClick={() => onReader(id)}>{label}</button>)}
      </div>
      {reader === 'overview' && (
        <div className="lip-tp"><div className="sk2-over">
          <section>
            <h5>Where it lives</h5>
            <dl className="sk2-kv">
              <div><dt>Found in</dt><dd><span className="mono" title={s.path}>{s.path || 'the office itself'}{s.project ? ` · ${s.project}` : ''}</span></dd></div>
              {s.env.length > 0 && <div><dt>Environment and headers</dt><dd><span className="mono">{s.env.join(', ')}</span><span className="sk2-chip">values are never shown</span></dd></div>}
            </dl>
          </section>
          <section>
            <h5>Where it works</h5>
            <div className="skw-socks">
              <div className={`skw-sock ${st === 'on' || st === 'locked' ? 'on' : 'off'}`}>
                <span className="skw-jack" aria-hidden><i /></span>
                <span className="skw-t"><b>Claude Code, in the app</b><small>{!claude ? (s.where === 'office' ? 'always on: agents reach the office through it' : 'not one of Claude Code’s own') : st === 'ownoff' ? 'its own file switched it off: turning it on clears that in the file' : 'agents the app runs, at each start'}</small></span>
                {claude ? <Switch on={st === 'on'} label={`${s.name} for Claude agents`} onChange={(v) => onSet(s.name, v)} /> : <span className="skw-st">{st === 'locked' ? 'locked' : 'not here'}</span>}
              </div>
              <div className={`skw-sock ${also.agyCli || s.where === 'agy-cli' || s.where === 'office' ? 'on' : 'none'}`}>
                <span className="skw-jack" aria-hidden><i /></span>
                <span className="skw-t"><b>agy CLI</b><small>{s.where === 'office' || s.where === 'agy-cli' || also.agyCli ? 'in agy’s own list' : 'not in agy’s list'}</small></span>
                <span className="skw-st">{s.where === 'office' || s.where === 'agy-cli' || also.agyCli ? 'listed' : 'not here'}</span>
              </div>
              <div className={`skw-sock ${also.agyIde || s.where === 'agy-ide' ? 'on' : 'none'}`}>
                <span className="skw-jack" aria-hidden><i /></span>
                <span className="skw-t"><b>agy IDE</b><small>{s.where === 'agy-ide' || also.agyIde ? 'in the IDE’s own list (read only)' : 'not in the IDE’s list'}</small></span>
                <span className="skw-st">{s.where === 'agy-ide' || also.agyIde ? 'listed' : 'not here'}</span>
              </div>
              <p className="hint skw-note">Off keeps its tools out of what Claude is offered in agents the app runs, from their next start. Agents already running keep it until they restart.</p>
            </div>
          </section>
          <section>
            <h5>Used in 30 days</h5>
            <Bars rows={Object.entries(used?.projects ?? {}).sort((a, b) => b[1] - a[1])} />
          </section>
        </div></div>
      )}
      {reader === 'tools' && <div className="lip-tp"><McpToolsTable server={s.name} tools={tools} usage={usage} connected={probe?.status === 'connected'} /></div>}
      {reader === 'entry' && <McpEntry server={s} folder={folder} onSaved={onSaved} onRemoved={onRemoved} />}
    </div>
  )
}
