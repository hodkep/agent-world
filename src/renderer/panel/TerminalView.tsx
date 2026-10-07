import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { mentionText } from '../../shared/mention'

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

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#0f0e16', foreground: '#e4e4ef' }
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
      {pick && visible && ask && (
        <button className="ask-selection term-ask" style={{ left: pick.x, top: pick.y }} onMouseDown={(e) => e.preventDefault()} onClick={addContext}>
          Add selection to message
        </button>
      )}
    </>
  )
}
