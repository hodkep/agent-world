import { useCallback, useEffect, useRef, useState } from 'react'
import { isBusy } from '../../shared/shells'
import { RUN_EVENT } from '../chat/runnable'
import { TerminalView } from './TerminalView'

const keyFor = (folder: string) => `aw.terms.${folder}`
const readIds = (folder: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(folder)) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * The terminals of the open project, in a drawer under the office: one tab each, a ✕ to close one, + to add another. Each is the
 * user's own shell starting in the project folder. Hiding the drawer only hides it: the shells keep running, and the ones this
 * project had are found again after the window reloads.
 */
export function TerminalDrawer({ folder, folderName, open, height, onHeight, onHide, onShow, onCount, ask }: { folder: string | null; folderName: string; open: boolean; height: number; onHeight: (h: number) => void; onHide: () => void; onShow: () => void; onCount: (n: number) => void; ask?: { agentId: string; onAttached: () => void } }) {
  const [ids, setIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [procs, setProcs] = useState<Record<string, { front: string; idle: string }>>({})
  const [focusTick, setFocusTick] = useState(0)

  // This project's terminals that are still alive.
  useEffect(() => {
    setLoaded(false)
    if (!folder) return void (setIds([]), setActive(null))
    let alive = true
    void window.aw.listShells().then((live) => {
      if (!alive) return
      const mine = readIds(folder).filter((id) => live.includes(id))
      setIds(mine)
      setActive(mine[0] ?? null)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [folder])
  useEffect(() => {
    if (folder && loaded) localStorage.setItem(keyFor(folder), JSON.stringify(ids))
  }, [ids, folder, loaded])
  useEffect(() => onCount(ids.length), [ids.length, onCount])
  useEffect(() => window.aw.onPtyExit((id) => setIds((l) => l.filter((x) => x !== id))), [])
  useEffect(() => {
    if (active && !ids.includes(active)) setActive(ids.at(-1) ?? null)
  }, [ids, active])

  // What is running in each: the tab says it, and a green square marks a shell with something running in front.
  useEffect(() => {
    if (!ids.length) return
    let alive = true
    const look = () => void window.aw.shellProcesses().then((p) => alive && setProcs(p))
    look()
    const t = setInterval(look, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [ids.length])

  const add = useCallback(async () => {
    if (!folder) return
    setError('')
    try {
      const id = await window.aw.openShell(folder)
      setIds((l) => [...l, id])
      setActive(id)
      setFocusTick((n) => n + 1)
      return id
    } catch (e) {
      setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      return null
    }
  }, [folder])

  // The first time the drawer is opened for a project with none, one is started for it.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current && loaded && ids.length === 0) void add()
    wasOpen.current = open
  }, [open, loaded, ids.length, add])

  const busy = (id: string) => !!procs[id] && isBusy(procs[id]!.idle, procs[id]!.front)

  // "Run in terminal" on a command in the chat: shown here and typed into the open terminal, or into a new one when that is busy
  // (keys would go to whatever is running there) or when there is none. Enter is pressed, because the click was the decision.
  const latest = useRef({ ids, active, busy })
  latest.current = { ids, active, busy }
  useEffect(() => {
    const run = async (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text
      if (!text || !folder) return
      const { ids: have, active: now, busy: isBusyNow } = latest.current
      // The drawer opening with no terminal would start one of its own; this one starts its own.
      wasOpen.current = true
      onShow()
      const id = now && have.includes(now) && !isBusyNow(now) ? now : await add()
      if (!id) return
      setActive(id)
      setFocusTick((n) => n + 1)
      window.aw.ptyWrite(id, `${text.replace(/\n/g, '\r')}\r`)
    }
    window.addEventListener(RUN_EVENT, run)
    return () => window.removeEventListener(RUN_EVENT, run)
  }, [folder, onShow, add])
  const close = (id: string, force = false) => {
    if (!force && busy(id)) {
      setActive(id)
      return setAsking(id)
    }
    window.aw.closeShell(id)
    setAsking(null)
    setIds((l) => l.filter((x) => x !== id))
    setFocusTick((n) => n + 1)
  }

  const resize = (e: React.PointerEvent) => {
    const start = e.clientY
    const from = height
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    const move = (m: Event) => onHeight(Math.max(110, from + (start - (m as PointerEvent).clientY)))
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
  }

  const nameOf = (id: string) => procs[id]?.front || 'terminal'
  return (
    <div className="tdrawer" id="terminal-drawer" role="region" aria-label="Terminals" hidden={!open} style={{ height }}>
      <div className="tgrip" onPointerDown={resize} title="Drag to resize the terminals" />
      <div className="ttop">
        <div className="ttabs" role="tablist" aria-label={`Terminals in ${folderName}`}>
          {ids.map((id) => (
            <div key={id} className={`ttab ${id === active ? 'on' : ''}`} role="tab" tabIndex={0} aria-selected={id === active} title={busy(id) ? `${nameOf(id)} is running` : `A shell in ${folderName}`} onClick={() => (setAsking(null), setActive(id), setFocusTick((n) => n + 1))} onAuxClick={(e) => e.button === 1 && (e.preventDefault(), close(id))} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActive(id))}>
              <i className={`tst ${busy(id) ? 'run' : ''}`} aria-hidden="true" />
              <span className="nm">{nameOf(id)}</span>
              <button className="x" aria-label={`Close ${nameOf(id)}`} title="Close this terminal" onClick={(e) => (e.stopPropagation(), close(id))}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button className="tadd" onClick={() => void add()} title={`New terminal in ${folderName}`} aria-label={`New terminal in ${folderName}`}>
          +
        </button>
        <span className="twhere" title={folder ?? ''}>
          {folderName}
        </span>
        <button className="thide" onClick={onHide} title="Hide the terminals; they keep running (Ctrl+`)" aria-label="Hide the terminals">
          ▾
        </button>
      </div>
      {asking && (
        <div className="task" role="alert">
          <span>
            <b>{nameOf(asking)}</b> is still running. Stop it and close this terminal?
          </span>
          <button className="danger" onClick={() => close(asking, true)}>
            Stop and close
          </button>
          <button onClick={() => (setAsking(null), setFocusTick((n) => n + 1))}>Keep</button>
        </div>
      )}
      {error && <p className="error tdrawer-error">{error}</p>}
      <div className="tbody">
        {ids.map((id) => (
          <TerminalView key={id} ptyId={id} visible={open && id === active} focusTick={focusTick} ask={ask} />
        ))}
        {ids.length === 0 && loaded && (
          <div className="tnone">
            <span>No terminals in {folderName}</span>
            <button onClick={() => void add()}>New terminal</button>
          </div>
        )}
      </div>
    </div>
  )
}
