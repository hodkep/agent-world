import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupServers, mcpKey, needsConfirm, type Described, type RemovalMode, type McpReport, type McpServer, type ProbeResult, type ToolUsage } from '../../shared/mcp'
import { Bars, clean, ConfirmRun, StatusChip, Switch } from './McpBits'
import { McpEntry } from './McpEntry'
import { RemoveFrom, type RemovePlan } from './RemoveFrom'
import { McpToolsTable } from './McpToolsTable'
import { alsoIn, callsOf, rowState } from './mcpView'
import { skillView, type SkillView } from './libraryUsage'

const COLOUR: Record<McpServer['where'], string> = { office: '#f2c230', global: '#5f9e5f', project: '#6ad0e0', plugin: '#a4a2b8', 'agy-cli': '#e07aa8', 'agy-ide': '#a4a2b8' }
const none: ToolUsage = { tools: {}, servers: {} }
type Reader = 'details' | 'tools' | 'entry'

/** The MCP servers the programs' own files list, as the Skills shelf lists skills: a panel for each program, one row for each server with its status, a reader for the open one. */
export function McpTab({ folder }: { folder?: string }) {
  const [rep, setRep] = useState<McpReport | null>(null)
  const [usage, setUsage] = useState<ToolUsage>(none)
  const [find, setFind] = useState('')
  const [open, setOpen] = useState<string | 'new' | null>(null)
  const [fail, setFail] = useState('')
  const [reader, setReader] = useState<Reader>('details')
  // Which servers the list shows; null until picked, so it opens on those called.
  const [view, setView] = useState<SkillView | null>(null)
  const [probes, setProbes] = useState<Record<string, ProbeResult>>({})
  const [busy, setBusy] = useState<Set<string>>(new Set())
  // A server that comes with a project is not started until its command has been shown and the person has said yes.
  const [ask, setAsk] = useState<{ s: McpServer; d: Described } | null>(null)
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
  const connect = (s: McpServer, digest?: string) => {
    setBusy((b) => new Set(b).add(s.id))
    return (digest ? window.aw.library.connectMcp(s.id, digest) : window.aw.library.connectMcp(s.id)).then(
      (r) => setProbes((p) => ({ ...p, [s.id]: r })),
      (e: unknown) => setFail(clean(e))
    ).finally(() => setBusy((b) => (b.delete(s.id), new Set(b))))
  }
  // Connect all starts what is in the person's own files; a project's .mcp.json is asked about one at a time.
  const connectAll = () => void Promise.all(rows.filter((s) => s.where !== 'office' && !needsConfirm(s) && !busy.has(s.id)).map((s) => connect(s)))
  const start = (s: McpServer) => {
    if (!needsConfirm(s)) return void connect(s)
    void window.aw.library.mcpDescribe({ id: s.id }).then((d) => setAsk({ s, d }), (err: unknown) => setFail(clean(err)))
  }
  const servers = useMemo(() => (rep?.servers ?? []).filter((s) => !find.trim() || `${s.name} ${s.fact}`.toLowerCase().includes(find.trim().toLowerCase())), [rep, find])
  // Each server once, as its row stands for it: the count, the switches and Connect all go by these, not by every place it is listed in.
  const rows = useMemo(() => groupServers(rep?.servers ?? []).flatMap((g) => g.rows), [rep])
  const off = rep?.off ?? []
  // A row stands for all its places, so the reader opens on the row; a place opened by its own id (after saving it) is found in the list.
  const current = open && open !== 'new' ? (rows.find((s) => s.id === open) ?? rep?.servers.find((s) => s.id === open)) : undefined
  const on = rows.filter((s) => rowState(s, off) === 'on').length
  const switchable = rows.filter((s) => ['on', 'off'].includes(rowState(s, off))).length
  const connected = Object.values(probes).filter((p) => p.status === 'connected').length
  const bad = Object.values(probes).filter((p) => p.status === 'failed' || p.status === 'timeout').length
  const called = rows.filter((s) => (callsOf(s, usage) ?? 0) > 0).length
  const quiet = rows.filter((s) => callsOf(s, usage) === 0).length
  const shown = skillView(view, find, called)
  const keep = (s: McpServer) => shown === 'all' || (shown === 'use' ? (callsOf(s, usage) ?? 0) > 0 : callsOf(s, usage) === 0)
  const groups = groupServers(servers).flatMap((g) => {
    const kept = g.rows.filter(keep)
    return kept.length ? [{ ...g, rows: kept }] : []
  })
  const VIEWS: [SkillView, string, number][] = [['use', 'Called in 30 days', called], ['rest', 'Not called', quiet], ['all', 'All', rows.length]]
  return (
    <div role="tabpanel" id="lib-panel-mcp" aria-labelledby="lib-tab-mcp" className="lib-panel lib-panel-shelf">
      <div className="lib-col">
        <div className="lib-bar" role="group" aria-label="MCP servers">
          <input aria-label="Find a server" placeholder="Find a server…" value={find} onChange={(e) => setFind(e.target.value)} />
          <span className="lib-sp" />
          <button onClick={() => void load()}>Refresh</button>
          <button disabled={busy.size > 0 || !rep} title="Start each server in your own files and read what it answers; a project's .mcp.json is asked about one at a time" onClick={connectAll}>Connect all</button>
          <button className="primary" onClick={() => (setOpen('new'), setReader('entry'))}>Add server…</button>
        </div>
        {rep && (
          <div className="lib-views" role="group" aria-label="Show" title={`${on} on for Claude agents of ${switchable} you can switch${connected + bad > 0 ? ` · ${connected} connected${bad ? ` · ${bad} failed` : ''}` : ''} · the number on a row is its calls in 30 days`}>
            {VIEWS.map(([id, label, n]) => <button key={id} className="ghost sm" aria-pressed={shown === id} onClick={() => (setView(id), setFind(''))}>{label} <b>{n}</b></button>)}
          </div>
        )}
        {fail && <p className="error" role="alert">{fail}</p>}
        {ask && <ConfirmRun name={ask.s.name} file={ask.s.path} d={ask.d} onRun={() => (setAsk(null), void connect(ask.s, ask.d.digest))} onCancel={() => setAsk(null)} />}
        <section className="drawer sk2" aria-label="MCP servers">
          <div className="sk2-list lib-scrollbar">
            {groups.map((g) => (
              <div key={g.key} className="sk2-pnl" role="group" aria-label={g.title}>
                <div className="sk2-grp"><b>{g.title}</b><span className="sk2-path" title={g.path}>{g.path}</span><span className="sk2-tot">{g.rows.length}</span></div>
                {g.rows.map((s) => {
                  const st = rowState(s, off)
                  // Calls are counted by Claude agents' server names: they say nothing about agy's own lists.
                  const n = callsOf(s, usage) ?? 0
                  const p = probes[s.id]
                  return (
                    <div key={s.id} className={`sk2-row mt-row${open === s.id ? ' sel' : ''}${st === 'off' || st === 'ownoff' ? ' off' : ''}${s.readOnly && s.where !== 'office' && s.where !== 'agy-cli' ? ' ro' : ''}`}>
                      <button className="mt-pick" aria-label={`Open ${s.name}`} aria-pressed={open === s.id} onClick={() => (setOpen(s.id), setReader('details'))}>
                        <span className="sk2-spine" style={{ background: COLOUR[s.where] }} aria-hidden />
                        <span className="sk2-main"><b>{s.name}</b><small>{s.transport}{s.fact ? ` · ${s.fact}` : ''}{st === 'ownoff' ? ' · off in its own file' : ''}</small></span>
                      </button>
                      <span className="mt-tail">
                        {s.places && <span className="sk2-chip" title="Listed in each of these; see its Places tab">{s.places.length} places</span>}
                        {s.where !== 'office' && (p || busy.has(s.id)) && <StatusChip probe={p} busy={busy.has(s.id)} />}
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
          <div className="lip lip-page" role="group" aria-label="New server">
            <div className="lip-top"><div className="lip-title"><b>New server</b></div><p className="lip-desc">Write its entry, test it, then save it into the file.</p></div>
            <McpEntry folder={folder} onSaved={(id) => void load().then(() => (setOpen(id || null), setReader('details')))} onRemoved={() => undefined} />
          </div>
        ) : current ? (
          <ServerReader key={current.id} s={current} group={groupServers(rep!.servers).find((g) => g.rows.some((r) => r.id === current.id))?.title ?? ''} all={rep!.servers} off={off} usage={usage} probe={probes[current.id]} busy={busy.has(current.id)} folder={folder} reader={reader} onReader={setReader} onSet={set} onConnect={() => start(current)}
            onSaved={(id) => void load().then(() => setOpen(id || null))} onRemoved={() => void load().then(() => setOpen(null))} />
        ) : <div className="lib-box lib-pick"><p className="hint">Pick a server to see where it lives, whether it connects, and the tools it offers.</p></div>}
      </div>
    </div>
  )
}

function ServerReader({ s, group, all, off, usage, probe, busy, folder, reader, onReader, onSet, onConnect, onSaved, onRemoved }: { s: McpServer; group: string; all: McpServer[]; off: string[]; usage: ToolUsage; probe?: ProbeResult; busy: boolean; folder?: string; reader: Reader; onReader: (r: Reader) => void; onSet: (name: string, on: boolean) => void; onConnect: () => void; onSaved: (id: string) => void; onRemoved: () => void }) {
  const st = rowState(s, off)
  const also = alsoIn(s, all)
  const used = usage.servers[mcpKey(s.name)]
  const claude = s.where === 'global' || s.where === 'project'
  const tools = probe?.status === 'connected' ? probe.tools : []
  const TABS: [Reader, string][] = [['details', 'Details'], ['tools', `Tools${tools.length ? ` (${tools.length})` : ''}`], ['entry', 'Entry (JSON)']]
  // The tabs are one stop in the Tab order: the arrow keys, Home and End move between them, and the tab moved to is picked.
  const keys = (e: React.KeyboardEvent) => {
    const at = TABS.findIndex(([id]) => id === reader)
    const to = e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    onReader(TABS[to]![0])
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[to]?.focus()
  }
  return (
    <div className="lip lip-page" role="group" aria-label={`${s.name} in detail`}>
      <div className="lip-top">
        <nav className="lip-crumb" aria-label="Where it is"><span>MCP servers</span><i aria-hidden>›</i><span>{group}</span><i aria-hidden>›</i><span>{s.name}</span></nav>
        <div className="lip-title mt-title"><h3>{s.name}</h3><small className="lib-kind">{s.transport}</small><span className="lib-sp" />{s.where !== 'office' && <span className="mt-head"><StatusChip probe={probe} busy={busy} /><button className="sm" aria-label={`${probe ? 'Reconnect' : 'Connect'} ${s.name}`} disabled={busy} onClick={onConnect}>{probe ? 'Reconnect' : 'Connect'}</button></span>}</div>
        {s.fact && <p className="lip-desc mono">{s.fact}</p>}
        {probe && probe.status !== 'connected' && <p className="mt-why" role="alert">{probe.message}</p>}
        {probe?.status === 'connected' && probe.server && <p className="hint mt-srv">{probe.server.name} {probe.server.version} · connected in {(probe.ms / 1000).toFixed(1)} s</p>}
      </div>
      <div className="lip-tabs" role="tablist" aria-label={`About ${s.name}`} onKeyDown={keys}>
        {TABS.map(([id, label]) => <button key={id} id={`mt-tab-${id}`} role="tab" aria-selected={reader === id} aria-controls={`mt-panel-${id}`} tabIndex={reader === id ? 0 : -1} className={reader === id ? 'on' : ''} onClick={() => onReader(id)}>{label}</button>)}
      </div>
      {reader === 'details' && (
        <div className="lip-details lib-scrollbar" role="tabpanel" id="mt-panel-details" aria-labelledby="mt-tab-details"><div className="lip-cols"><div className="sk2-over">
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
            <h5>Calls in 30 days{used?.n ? ` · ${used.n}` : ''}</h5>
            <Bars rows={Object.entries(used?.projects ?? {}).sort((a, b) => b[1] - a[1])} />
          </section>
          <Places s={s} onChanged={onRemoved} />
        </div></div></div>
      )}
      {reader === 'tools' && <div className="lip-tp" role="tabpanel" id="mt-panel-tools" aria-labelledby="mt-tab-tools"><McpToolsTable server={s.name} tools={tools} usage={usage} connected={probe?.status === 'connected'} /></div>}
      {reader === 'entry' && <div className="lip-tp" role="tabpanel" id="mt-panel-entry" aria-labelledby="mt-tab-entry"><EntryOf s={s} folder={folder} onSaved={onSaved} onRemoved={onRemoved} /></div>}
    </div>
  )
}

const base = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p

/** Each file that lists this server, by project with Claude Code's own list first: what a row that stands for several says about where it comes from. */
function Places({ s, onChanged }: { s: McpServer; onChanged: () => void }) {
  const all = s.places ?? [s]
  const by = new Map<string, McpServer[]>()
  for (const p of all) by.set(p.project ?? '', [...(by.get(p.project ?? '') ?? []), p])
  // The main process makes the plan from a fresh scan; what is shown is what it does, and it does nothing if the files changed meanwhile.
  const planFor = async (mode: RemovalMode, placeId?: string): Promise<RemovePlan> => {
    const shown = await window.aw.library.mcpRemovalPlan(s.id, mode, placeId)
    return {
      lines: shown.steps.map((st) => ({ text: st.path, note: `${st.action === 'add-global' ? 'adds it here first, so one global stays' : 'removes it here'}${st.project ? ` · ${base(st.project)}` : ''}${st.repo ? ' · comes with the repo: git shows the change' : ''}` })),
      commit: () => window.aw.library.mcpRemoval(s.id, mode, placeId, shown)
    }
  }
  return (
    <>
      {all.length > 1 && (
        <section>
          <h5>Take it out of</h5>
          <RemoveFrom name={s.name} plan={(k) => planFor(k as RemovalMode)} onDone={onChanged} options={[
            { key: 'projects', label: 'Every project', icon: 'layers', hint: 'Keeps the entry in Claude Code’s own file' },
            { key: 'all', label: 'Every place', icon: 'trash', tone: 'danger', hint: 'Removes it from Claude Code’s own file as well' },
            { key: 'keep-global', label: 'Keep one global, remove the project ones', icon: 'pin', tone: 'keep', hint: 'Adds it to Claude Code’s own file first when it is not there' }
          ]} />
        </section>
      )}
      {[...by].map(([project, ps]) => (
        <section key={project}>
          <h5 className="mt-pg"><b>{project ? base(project) : 'Everywhere'}</b><span className="mono" title={project}>{project || 'Claude Code’s own file'}</span></h5>
          {ps.map((p) => (
            <div key={p.id} className="mt-place">
              <span className="mono" title={p.path}>{p.path || 'the office itself'}</span>
              {p.editable && <RemoveFrom name={s.name} inline options={[{ key: 'one', label: 'Remove from here', icon: 'trash' }]} plan={(k) => planFor(k as RemovalMode, p.id)} onDone={onChanged} />}
              <small>{needsConfirm(p) ? 'comes with the repo · asks before it runs' : p.where === 'global' ? 'Claude Code’s own list' : p.where === 'project' ? 'a project’s list in Claude Code’s own file' : 'its own list'}{p.disabled ? ' · switched off in this file' : ''}</small>
            </div>
          ))}
        </section>
      ))}
      {all.length > 1 && <p className="hint skw-note">Listed the same in each place: the same command or address and the same variable names. What the variables hold is never read, so one place could carry another account’s token. Open it in Entry (JSON) to see.</p>}
    </>
  )
}

/** The entry of one place at a time: the one in Claude's own file to begin with, and a pick when the server is listed in several. */
function EntryOf({ s, folder, onSaved, onRemoved }: { s: McpServer; folder?: string; onSaved: (id: string) => void; onRemoved: () => void }) {
  const places = s.places ?? [s]
  const [pid, setPid] = useState(s.id)
  const cur = places.find((p) => p.id === pid) ?? s
  return (
    <>
      {places.length > 1 && (
        <label className="mt-placepick">Place to edit
          <select aria-label="Place to edit" value={cur.id} onChange={(e) => setPid(e.target.value)}>
            {places.map((p) => <option key={p.id} value={p.id}>{p.project ? base(p.project) : 'Everywhere'} · {p.path}</option>)}
          </select>
        </label>
      )}
      <McpEntry key={cur.id} server={cur} folder={folder} onSaved={onSaved} onRemoved={onRemoved} />
    </>
  )
}
