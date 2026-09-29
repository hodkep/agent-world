import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef } from 'react'

export function TerminalView({ agentId, visible }: { agentId: string; visible: boolean }) {
  const el = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#0f0e16', foreground: '#e4e4ef' }
    })
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
    const offData = window.aw.onPtyData((id, data, end) => id === agentId && write(data, end))
    void window.aw.ptyBuffer(agentId).then(({ text, end }) => {
      term.write(text)
      replayEnd = end
      for (const c of early.splice(0)) write(c.data, c.end)
    })
    const input = term.onData((d) => window.aw.ptyWrite(agentId, d))
    const resize = term.onResize(({ cols, rows }) => window.aw.ptyResize(agentId, cols, rows))
    const ro = new ResizeObserver(() => el.current?.offsetParent && fit.fit())
    ro.observe(el.current!)

    return () => {
      offData()
      input.dispose()
      resize.dispose()
      ro.disconnect()
      term.dispose()
    }
  }, [agentId])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fitRef.current?.fit())
  }, [visible])

  return <div ref={el} className="term-host" style={{ display: visible ? 'block' : 'none' }} />
}
