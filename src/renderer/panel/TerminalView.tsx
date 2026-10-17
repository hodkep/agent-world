import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { mentionText } from '../../shared/mention'
import { openFileEvent } from '../files/context'
import { macKeySequence } from './macKeys'
import { type Match, findMatches, markTarget, stepMatch } from './termFind'
import { findWrappedLinks } from './termLinks'

// `focusTick` changes whenever the panel wants keys back in this terminal (after a card button stole focus).
/** A terminal on one of the app's ptys: an agent's, or a shell in the grid (its id starts with `term:`). */
export function TerminalView({ ptyId, visible, focusTick, ask }: { ptyId: string; visible: boolean; focusTick: number; ask?: { agentId: string; onAttached: () => void } }) {
  const el = useRef<HTMLDivElement>(null)
  // Words selected in the terminal can be sent to the agent's message box, as selected code and file text are.
  const [pick, setPick] = useState<{ text: string; x: number; y: number } | null>(null)
  const askRef = useRef(ask)
  askRef.current = ask
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  // Find in the terminal: the bar, what was typed, and where the current match is.
  const [find, setFind] = useState<{ query: string; matchCase: boolean; at: number; count: number } | null>(null)
  const findRef = useRef(find)
  findRef.current = find
  const matches = useRef<Match[]>([])
  const marks = useRef<{ marker: import('@xterm/xterm').IMarker; exit?: number }[]>([])
  const [away, setAway] = useState(false)
  const [rect, setRect] = useState({ right: 0, top: 0, bottom: 0 })

  const openFind = () => {
    const box = el.current?.getBoundingClientRect()
    if (box) setRect({ right: box.right, top: box.top, bottom: box.bottom })
    const sel = termRef.current?.getSelection().trim()
    setFind((f) => ({ query: sel && !sel.includes('\n') ? sel : (f?.query ?? ''), matchCase: f?.matchCase ?? false, at: -1, count: 0 }))
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.term-find input')?.select())
  }
  // Looks for the text anew, or steps to the next or previous match, and shows it selected in the output.
  const search = (query: string, matchCase: boolean, step: 1 | -1 | 0) => {
    const term = termRef.current
    if (!term) return
    if (step === 0) {
      const buf = term.buffer.active
      const lines = Array.from({ length: buf.length }, (_, i) => buf.getLine(i)?.translateToString(true) ?? '')
      matches.current = findMatches(lines, query, matchCase)
    }
    const prev = findRef.current?.at ?? -1
    const at = step === 0 ? (matches.current.length ? matches.current.length - 1 : -1) : stepMatch(matches.current.length, prev, step)
    const m = matches.current[at]
    if (m) {
      term.select(m.col, m.row, m.len)
      term.scrollToLine(Math.max(0, m.row - Math.floor(term.rows / 2)))
    } else term.clearSelection()
    setFind({ query, matchCase, at, count: matches.current.length })
  }
  const closeFind = () => {
    setFind(null)
    termRef.current?.clearSelection()
    termRef.current?.focus()
  }

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      // Decorations (the marks down the scrollbar) are still behind this switch in xterm.
      allowProposedApi: true,
      theme: { background: '#0f0e16', foreground: '#e4e4ef' },
      // Failed and passed commands are marked down the scrollbar.
      overviewRuler: { width: 8 }
    })
    termRef.current = term
    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.open(el.current!)

    // Live chunks arrive before the replay; hold them and drop what the replay already covers.
    let replayEnd: number | null = null
    const early: { data: string; end: number }[] = []
    const write = (data: string, end: number) => {
      if (replayEnd === null) return void early.push({ data, end })
      const start = end - data.length
      if (end <= replayEnd) return
      term.write(start < replayEnd ? data.slice(replayEnd - start) : data)
    }
    const offData = window.aw.onPtyData((id, data, end) => id === ptyId && write(data, end))
    void window.aw.ptyBuffer(ptyId).then(({ text, end }) => {
      term.write(text)
      replayEnd = end
      for (const c of early.splice(0)) write(c.data, c.end)
    })
    const input = term.onData((d) => window.aw.ptyWrite(ptyId, d))
    // Cmd and Option with the arrows move by line and by word, as in the system terminal.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        if (e.key === 'f') return (openFind(), false)
        if (e.key === 'k') return (term.clear(), false)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Between the commands typed here, when the shell marks its prompts.
          const lines = marks.current.filter((m) => !m.marker.isDisposed).map((m) => m.marker.line)
          if (lines.length === 0) return true
          const to = markTarget(lines, term.buffer.active.viewportY, e.key === 'ArrowUp' ? -1 : 1)
          if (to === 'end') term.scrollToBottom()
          else if (to !== null) term.scrollToLine(to)
          return false
        }
      }
      const seq = macKeySequence(e)
      if (seq === null) return true
      window.aw.ptyWrite(ptyId, seq)
      return false
    })
    // Addresses and file paths in the output open with Cmd (or Ctrl) held down.
    const links = term.registerLinkProvider({
      provideLinks: (y, done) => {
        // A line the terminal wrapped is read whole, so a long address is one link.
        const buf = term.buffer.active
        let first = y - 1
        while (first > 0 && buf.getLine(first)?.isWrapped) first--
        const rows: string[] = []
        for (let i = first; i < buf.length; i++) {
          const row = buf.getLine(i)
          if (!row || (i > first && !row.isWrapped)) break
          rows.push(row.translateToString(true))
        }
        const found = findWrappedLinks(rows, term.cols, first + 1).filter((l) => (l.kind === 'url' || askRef.current) && l.range.start.y <= y && l.range.end.y >= y)
        done(
          found.map((l) => ({
            range: l.range,
            text: l.target,
            activate: (ev: MouseEvent) => {
              if (!(ev.metaKey || ev.ctrlKey)) return
              if (l.kind === 'url') void window.aw.openExternal(l.target).catch(() => {})
              else if (askRef.current) openFileEvent(askRef.current.agentId, l.target)
            }
          }))
        )
      }
    })
    // The shell says where each prompt starts (133;A) and how the command before it ended (133;D;code).
    const osc = term.parser.registerOscHandler(133, (data) => {
      const [kind, code] = data.split(';')
      if (kind === 'A') marks.current.push({ marker: term.registerMarker(0) })
      else if (kind === 'D' && marks.current.length > 0) {
        const last = marks.current[marks.current.length - 1]!
        last.exit = Number(code ?? 0)
        term.registerDecoration({ marker: last.marker, overviewRulerOptions: { color: last.exit === 0 ? '#5f9e5f' : '#d83a3a', position: 'full' } })
      }
      return true
    })
    const watch = () => {
      setAway(term.buffer.active.viewportY < term.buffer.active.baseY)
      const box = el.current?.getBoundingClientRect()
      if (box) setRect({ right: box.right, top: box.top, bottom: box.bottom })
    }
    const scrolled = term.onScroll(watch)
    const written = term.onWriteParsed(watch)
    const resize = term.onResize(({ cols, rows }) => window.aw.ptyResize(ptyId, cols, rows))
    const menu = (e: MouseEvent) => {
      e.preventDefault()
      void window.aw.terminalMenu(term.getSelection()).then((text) => text && term.paste(text))
    }
    el.current!.addEventListener('contextmenu', menu)
    // Once the mouse is released over a selection: a button above it, or below it when it is at the top.
    const place = () => {
      const text = term.hasSelection() ? term.getSelection().replace(/[ \t]+$/gm, '').trim() : ''
      const pos = term.getSelectionPosition()
      const screen = el.current?.querySelector<HTMLElement>('.xterm-screen')
      if (!askRef.current || !text || !pos || !screen) return setPick(null)
      const box = screen.getBoundingClientRect()
      const host = el.current!.getBoundingClientRect()
      const cw = box.width / term.cols
      const ch = box.height / term.rows
      const top = box.top + (pos.start.y - term.buffer.active.viewportY) * ch - 30
      const under = box.top + (pos.end.y - term.buffer.active.viewportY + 1) * ch + 8
      setPick({ text, x: Math.max(host.left + 8, Math.min(host.right - 190, box.left + pos.start.x * cw)), y: top < host.top ? Math.min(under, host.bottom - 36) : top })
    }
    const released = () => requestAnimationFrame(place)
    el.current!.addEventListener('mouseup', released)
    const cleared = term.onSelectionChange(() => !term.hasSelection() && setPick(null))
    const ro = new ResizeObserver(() => el.current?.offsetParent && fit.fit())
    ro.observe(el.current!)

    return () => {
      offData()
      input.dispose()
      resize.dispose()
      links.dispose()
      osc.dispose()
      scrolled.dispose()
      written.dispose()
      ro.disconnect()
      el.current?.removeEventListener('contextmenu', menu)
      el.current?.removeEventListener('mouseup', released)
      cleared.dispose()
      term.dispose()
    }
  }, [ptyId])

  useEffect(() => {
    // Selecting an agent means "talk to it": keys go straight to its terminal.
    if (visible)
      requestAnimationFrame(() => {
        fitRef.current?.fit()
        termRef.current?.focus()
      })
  }, [visible, focusTick])

  // Dropping files types @-mentions into Claude's input; the user still decides when to send.
  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    const text = mentionText([...e.dataTransfer.files].map((f) => window.aw.pathOf(f)))
    if (text) {
      window.aw.ptyWrite(ptyId, text)
      termRef.current?.focus()
    }
  }
  const addContext = () => {
    if (!pick || !ask) return
    const quoted = pick.text.split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
    window.dispatchEvent(new CustomEvent('aw-context', { detail: { agentId: ask.agentId, text: `From the terminal:\n${quoted}`, file: null, label: 'terminal, selection' } }))
    termRef.current?.clearSelection()
    setPick(null)
    ask.onAttached()
  }
  return (
    <>
      <div ref={el} className="term-host" style={{ display: visible ? 'block' : 'none' }} onDragOver={(e) => e.preventDefault()} onDrop={drop} />
      {find && visible && (
        <div className="term-find" style={{ right: window.innerWidth - rect.right + 18, top: rect.top + 6 }} role="search">
          <input
            aria-label="Find in terminal"
            placeholder="Find"
            value={find.query}
            onChange={(e) => search(e.target.value, find.matchCase, 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search(find.query, find.matchCase, e.shiftKey ? -1 : 1)
              else if (e.key === 'Escape') closeFind()
            }}
          />
          <span className="term-find-n" aria-live="polite">{find.query ? (find.count ? `${find.at + 1} of ${find.count}` : 'No results') : ''}</span>
          <button aria-label="Match case" aria-pressed={find.matchCase} className={find.matchCase ? 'on' : ''} onClick={() => search(find.query, !find.matchCase, 0)}>Aa</button>
          <button aria-label="Previous match" onClick={() => search(find.query, find.matchCase, -1)}>↑</button>
          <button aria-label="Next match" onClick={() => search(find.query, find.matchCase, 1)}>↓</button>
          <button aria-label="Close find" onClick={closeFind}>✕</button>
        </div>
      )}
      {away && visible && (
        <button className="term-bottom" style={{ right: window.innerWidth - rect.right + 22, top: rect.bottom - 40 }} onClick={() => (termRef.current?.scrollToBottom(), termRef.current?.focus())} aria-label="Scroll to the latest output" title="Scroll to the latest output">
          ↓
        </button>
      )}
      {pick && visible && ask && (
        <button className="ask-selection term-ask" style={{ left: pick.x, top: pick.y }} onMouseDown={(e) => e.preventDefault()} onClick={addContext}>
          Add selection to message
        </button>
      )}
    </>
  )
}
