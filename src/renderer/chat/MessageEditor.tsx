import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { Annotation, Compartment, EditorSelection, EditorState, Transaction, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder as placeholderText, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { insertNewline, standardKeymap } from '@codemirror/commands'
import { highlight } from './format'
import { liveMarks } from './liveMarks'

/** What the message box offers the chat around it: the few things it used to ask of a textarea. */
export type EditorHandle = {
  focus(): void
  setSelectionRange(from: number, to: number): void
  readonly selectionStart: number
  readonly selectionEnd: number
  insertText(text: string): void
  addEventListener(type: string, fn: (e: Event) => void): void
  removeEventListener(type: string, fn: (e: Event) => void): void
}

type Props = {
  value: string
  placeholder: string
  label: string
  title: string
  /** `how` is 'type' for typing and 'edit' for a paste, a drop or a cut; the undo history joins the first and not the second. */
  onChange(value: string, how: 'type' | 'edit', caret: number): void
  onSelect(caret: number): void
  onPaste(e: ClipboardEvent): void
  onKeyDown(e: KeyboardEvent): void
}

const words = new Compartment()
const wording = (p: Pick<Props, 'placeholder' | 'label' | 'title'>) => [placeholderText(p.placeholder), EditorView.contentAttributes.of({ 'aria-label': p.label, title: p.title, spellcheck: 'true' })]

/** A change made from outside (the value the chat hands in), which is not the person typing. */
const Remote = Annotation.define<boolean>()

class Bullet extends WidgetType {
  toDOM() {
    const el = document.createElement('span')
    el.className = 'lm-bullet'
    el.textContent = '•'
    return el
  }
  eq() {
    return true
  }
}

const LINE = new Set(['h1', 'h2', 'h3', 'quote', 'codeline', 'fence', 'hide-line'])
const MARK = new Set(['bold', 'italic', 'code', 'link', 'num', 'marker'])

/** The drawing: markdown rendered as it is typed, with the markers back on the lines the caret touches, and commands and @files tinted. */
function decorate(view: EditorView): { all: DecorationSet; hidden: DecorationSet } {
  const { state } = view
  const text = state.doc.toString()
  const out: Range<Decoration>[] = []
  const hidden: Range<Decoration>[] = []
  let at = 0
  for (const p of highlight(text)) {
    if (p.kind !== 'plain') out.push(Decoration.mark({ class: `tok-${p.kind}` }).range(at, at + p.text.length))
    at += p.text.length
  }
  if (!text.startsWith('!')) {
    const { from, to } = state.selection.main
    for (const m of liveMarks(text, { from, to })) {
      if (LINE.has(m.kind)) out.push(Decoration.line({ class: `lm-${m.kind}` }).range(state.doc.lineAt(m.from).from))
      else if (MARK.has(m.kind)) out.push(Decoration.mark({ class: `lm-${m.kind}` }).range(m.from, m.to))
      else if (m.kind === 'hide' || m.kind === 'bullet') {
        const d = (m.kind === 'hide' ? Decoration.replace({}) : Decoration.replace({ widget: new Bullet() })).range(m.from, m.to)
        out.push(d)
        hidden.push(d)
      }
    }
  }
  return { all: Decoration.set(out, true), hidden: Decoration.set(hidden, true) }
}

const drawing = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    hidden: DecorationSet
    constructor(view: EditorView) {
      ;({ all: this.decorations, hidden: this.hidden } = decorate(view))
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) ({ all: this.decorations, hidden: this.hidden } = decorate(u.view))
    }
  },
  {
    decorations: (v) => v.decorations,
    // The hidden markers are skipped over, not stepped through one key press at a time; tinted words are not.
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.hidden ?? Decoration.none)
  }
)

/**
 * The message box: plain markdown text that is drawn rendered while it is typed. The text is the only truth;
 * everything seen (big headings, bullets, hidden markers) is drawn over it, so what is sent is exactly what was typed.
 */
export const MessageEditor = forwardRef<EditorHandle, Props>(function MessageEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(props)
  latest.current = props

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    setSelectionRange: (a, b) => {
      const v = view.current
      if (v) v.dispatch({ selection: EditorSelection.range(Math.min(a, v.state.doc.length), Math.min(b, v.state.doc.length)) })
    },
    get selectionStart() {
      return view.current?.state.selection.main.from ?? 0
    },
    get selectionEnd() {
      return view.current?.state.selection.main.to ?? 0
    },
    insertText: (t) => view.current?.dispatch(view.current.state.replaceSelection(t), { userEvent: 'input.paste', scrollIntoView: true }),
    addEventListener: (type, fn) => view.current?.contentDOM.addEventListener(type, fn),
    removeEventListener: (type, fn) => view.current?.contentDOM.removeEventListener(type, fn)
  }))

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          // Before the keymap: the chat takes Enter to send, and the keys it does not take go on to the editor.
          EditorView.domEventHandlers({
            keydown: (e) => void latest.current.onKeyDown(e),
            paste: (e) => (latest.current.onPaste(e), e.defaultPrevented),
            // Files dropped on the box are for the chat to attach, not to be read into the text.
            drop: (e) => !!e.dataTransfer?.files.length
          }),
          // Enter and Shift+Enter both make a new line when the chat did not take Enter to send.
          keymap.of([{ key: 'Enter', shift: insertNewline, run: insertNewline }, ...standardKeymap]),
          drawing,
          EditorView.lineWrapping,
          words.of(wording(latest.current)),
          EditorView.updateListener.of((u) => {
            // The exact text, for the specs: what is drawn leaves out the hidden markers.
            if (u.docChanged) u.view.contentDOM.dataset.text = u.state.doc.toString()
            if (u.docChanged && !u.transactions.some((t) => t.annotation(Remote))) {
              const how = u.transactions.some((t) => /^(input\.(paste|drop)|delete\.cut)/.test(t.annotation(Transaction.userEvent) ?? '')) ? 'edit' : 'type'
              latest.current.onChange(u.state.doc.toString(), how, u.state.selection.main.from)
            } else if (u.selectionSet) latest.current.onSelect(u.state.selection.main.from)
          })
        ]
      })
    })
    v.contentDOM.dataset.text = latest.current.value
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [])

  // The value the chat holds is shown when it was changed from outside (a completion, an older message, undo, a send).
  useLayoutEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === props.value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.value }, selection: { anchor: props.value.length }, annotations: Remote.of(true) })
  }, [props.value])

  useEffect(() => view.current?.dispatch({ effects: words.reconfigure(wording(props)) }), [props.placeholder, props.label, props.title])

  return <div className="composer-editor" ref={host} />
})
