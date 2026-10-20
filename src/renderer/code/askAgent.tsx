import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { keysOf } from '../shortcuts'
import { monaco } from './monaco'

/** Where to bring a piece of code back to, from its chip. */
export interface CodeJump {
  path: string
  from: number
  to: number
}

/** Some selected code, ready to go into the agent's message. */
export interface AskContext {
  text: string
  label: string
  jump: CodeJump
}

export const CONTEXT_EVENT = 'aw-context'
export const CONTEXT_CHANGED = 'aw-context-changed'
export const CONTEXT_REMOVE = 'aw-context-remove'

/** What the message box tells the Code view about the chips waiting in it, so the two always show the same ones. */
export interface ContextChip {
  id: string
  label: string
  source: string
  jump?: CodeJump
}

/**
 * Selecting code in an editor offers "Ask <agent>", and ⌘L does the same from the keyboard: the code goes into the agent's
 * message box as a chip, and the editor stays as it is so more can be added. `describe` says what a selection becomes.
 */
export function useAskSelection(o: { agentId: string; agentName: string; host: RefObject<HTMLElement | null>; describe: (editor: monaco.editor.ICodeEditor, sel: monaco.Selection) => AskContext | null }) {
  const [bubble, setBubble] = useState<{ x: number; y: number; under: boolean } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const last = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const describe = useRef(o.describe)
  describe.current = o.describe
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const place = useCallback(
    (e: monaco.editor.IStandaloneCodeEditor) => {
      const sel = e.getSelection()
      const host = o.host.current
      const dom = e.getDomNode()
      const text = sel && !sel.isEmpty() ? e.getModel()?.getValueInRange(sel) : ''
      if (!sel || !host || !dom || !text?.trim()) return setBubble(null)
      last.current = e
      const from = e.getScrolledVisiblePosition(sel.getStartPosition())
      const to = e.getScrolledVisiblePosition(sel.getEndPosition())
      if (!from || !to) return setBubble(null)
      const h = host.getBoundingClientRect()
      const d = dom.getBoundingClientRect()
      const above = d.top - h.top + from.top - 40
      const under = above < 4
      setBubble({ x: Math.max(8, Math.min(h.width - 150, d.left - h.left + from.left)), y: under ? d.top - h.top + to.top + to.height + 8 : above, under })
    },
    [o.host]
  )

  const add = useCallback(() => {
    const e = last.current
    const sel = e?.getSelection()
    if (!e || !sel || sel.isEmpty()) return
    const ctx = describe.current(e, sel)
    if (!ctx) return
    window.dispatchEvent(new CustomEvent(CONTEXT_EVENT, { detail: { agentId: o.agentId, text: ctx.text, file: null, label: ctx.label, source: 'Code', jump: ctx.jump } }))
    setBubble(null)
    setToast(`Added ${ctx.label} to your message to ${o.agentName}.`)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
    e.focus()
  }, [o.agentId, o.agentName])

  useEffect(() => () => clearTimeout(timer.current), [])

  /** Wires an editor in; call it where the editor is made and dispose what it returns with the editor. */
  const attach = useCallback(
    (e: monaco.editor.IStandaloneCodeEditor) => {
      const parts = [
        e.onDidChangeCursorSelection(() => place(e)),
        e.onDidScrollChange(() => setBubble(null)),
        e.onDidChangeModel(() => setBubble(null)),
        e.addAction({
          id: 'aw.ask',
          label: 'Add selection to message',
          keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
          run: () => {
            last.current = e
            add()
          }
        })
      ]
      return { dispose: () => parts.forEach((p) => p.dispose()) }
    },
    [place, add]
  )

  const view = (
    <>
      {bubble && (
        <button className={`ask-selection code-ask ${bubble.under ? 'under' : ''}`} style={{ left: bubble.x, top: bubble.y }} onMouseDown={(e) => e.preventDefault()} onClick={add} title={`Add the selected code to your message to ${o.agentName} (⌘L, or ${keysOf('add-selection')} as everywhere else)`}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3h12v8H8l-3.5 3v-3H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          Ask {o.agentName}
          <kbd>⌘L</kbd>
        </button>
      )}
      {toast && (
        <div className="code-toast" role="status">
          {toast}
        </div>
      )}
    </>
  )
  return { attach, view }
}

/** The chips waiting in the agent's message, shown under the editor, each taking you back to its lines; ✕ takes it off the message. */
export function ContextTray({ agentId, onJump, onOpenChat }: { agentId: string; onJump: (j: CodeJump) => void; onOpenChat: () => void }) {
  const [chips, setChips] = useState<ContextChip[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ agentId: string; chips: ContextChip[] }>).detail
      if (d.agentId === agentId) setChips(d.chips)
    }
    window.addEventListener(CONTEXT_CHANGED, on)
    // The message box may already hold some: ask it to say so.
    window.dispatchEvent(new CustomEvent('aw-context-ask', { detail: { agentId } }))
    return () => window.removeEventListener(CONTEXT_CHANGED, on)
  }, [agentId])
  if (!chips.length) return null
  return (
    <div className="ctx-tray" role="group" aria-label="In the message to the agent">
      <span className="ctx-lab">In the message</span>
      {chips.map((c) => (
        <span key={c.id} className="ctx-chip">
          <button className="ctx-jump" disabled={!c.jump} onClick={() => c.jump && onJump(c.jump)} title={c.jump ? 'Go to these lines' : c.source}>
            {c.label}
          </button>
          <button className="chip-x" aria-label={`Take ${c.label} off the message`} title="Take this off the message" onClick={() => window.dispatchEvent(new CustomEvent(CONTEXT_REMOVE, { detail: { agentId, id: c.id } }))} />
        </span>
      ))}
      <button className="ctx-open" onClick={onOpenChat} title="Open the chat, where the message box holds these">
        Open chat
      </button>
    </div>
  )
}
