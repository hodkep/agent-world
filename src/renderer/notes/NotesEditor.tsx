import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { EditorState, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type ViewUpdate } from '@codemirror/view'
import { noteLines } from '../../shared/notePlan'

export interface LineActions {
  /** Make a task of the line (and the lines indented under it). */
  task: (line: number) => void
  /** Make the line a subtask of the item above it. */
  subtask: (line: number) => void
  ask: (line: number, anchor: HTMLElement) => void
}

class Box extends WidgetType {
  constructor(readonly done: boolean, readonly at: number, readonly len: number) { super() }
  eq(o: Box) { return o.done === this.done && o.at === this.at && o.len === this.len }
  toDOM(view: EditorView) {
    const b = document.createElement('button')
    b.className = `nt-box${this.done ? ' on' : ''}`
    b.setAttribute('role', 'checkbox')
    b.setAttribute('aria-checked', String(this.done))
    b.setAttribute('aria-label', this.done ? 'Done' : 'Not done')
    b.textContent = this.done ? '✓' : ''
    b.onmousedown = (e) => {
      e.preventDefault()
      // The box is the three characters "[ ]" or "[x]", after the dash.
      view.dispatch({ changes: { from: this.at, to: this.at + 3, insert: this.done ? '[ ]' : '[x]' } })
    }
    return b
  }
  ignoreEvent() { return true }
}

class Dot extends WidgetType {
  toDOM() { const s = document.createElement('span'); s.className = 'nt-dot'; s.textContent = '•'; return s }
}

class Actions extends WidgetType {
  constructor(readonly line: number, readonly sub: boolean, readonly linked: boolean, readonly h: LineActions) { super() }
  eq(o: Actions) { return o.line === this.line && o.sub === this.sub && o.linked === this.linked }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'nt-act'
    const add = (label: string, cls: string, fn: (b: HTMLElement) => void) => {
      const b = document.createElement('button')
      b.className = cls
      b.textContent = label
      b.onmousedown = (e) => (e.preventDefault(), fn(b))
      wrap.append(b)
    }
    // A line that is a task already can still be asked about.
    if (!this.linked) {
      add(this.sub ? '→ Subtask' : '→ Task', 'go', () => (this.sub ? this.h.subtask(this.line) : this.h.task(this.line)))
      if (!this.sub) add('→ Subtask', '', () => this.h.subtask(this.line))
    }
    add('Ask agent', this.linked ? 'go' : '', (b) => this.h.ask(this.line, b))
    return wrap
  }
  ignoreEvent() { return true }
}

const INLINE: [RegExp, string][] = [[/\*\*[^*\n]+\*\*/g, 'nt-b'], [/(?<![*\w])\*[^*\n]+\*(?!\*)/g, 'nt-i'], [/`[^`\n]+`/g, 'nt-code'], [/~~[^~\n]+~~/g, 'nt-s']]

function build(view: EditorView, h: LineActions): DecorationSet {
  const text = view.state.doc.toString()
  const lines = noteLines(text)
  const out: Range<Decoration>[] = []
  for (const l of lines) {
    const line = view.state.doc.line(l.line + 1)
    const raw = line.text
    if (l.kind === 'heading') {
      const level = /^\s*(#{1,6})/.exec(raw)![1]!.length
      out.push(Decoration.line({ class: `nt-h nt-h${Math.min(level, 3)}` }).range(line.from))
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      out.push(Decoration.line({ class: 'nt-hr' }).range(line.from))
      continue
    }
    if (l.kind === 'item') {
      const m = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s?)?/.exec(raw)!
      const start = line.from + m[1]!.length
      out.push(Decoration.line({ class: `nt-item${l.done ? ' done' : ''}${l.todo ? ' linked' : ''}`, attributes: { style: `padding-left:${m[1]!.length * 5 + 2}px` } }).range(line.from))
      if (m[3] !== undefined) out.push(Decoration.replace({ widget: new Box(l.done, start + 2, 3) }).range(start, start + 2 + 3))
      else out.push(Decoration.replace({ widget: new Dot() }).range(start, start + 1))
      if (l.todo) {
        const at = raw.lastIndexOf('(todo#')
        out.push(Decoration.mark({ class: 'nt-linked' }).range(line.from + at, line.to))
      }
      out.push(Decoration.widget({ widget: new Actions(l.line, l.indent >= 2, !!l.todo, h), side: 1 }).range(line.to))
    }
    for (const [re, cls] of INLINE) for (const x of raw.matchAll(re)) out.push(Decoration.mark({ class: cls }).range(line.from + x.index!, line.from + x.index! + x[0].length))
  }
  return Decoration.set(out, true)
}

/** What an empty note says: where to start, and what is possible. */
function hint() {
  const el = document.createElement('div')
  el.className = 'nt-hint'
  const a = document.createElement('b')
  a.textContent = 'Start typing…'
  const b = document.createElement('span')
  b.textContent = 'Markdown works. Start a line with - [ ] for a checklist, then point at it to make a task.'
  el.append(a, b)
  return el
}

/** The note as it is typed: Markdown with headings, checklists (a real box), bold, italics and code drawn as it goes, and on each bullet or checklist line the buttons that make it a task. */
export function NotesEditor({ value, onChange, actions }: { value: string; onChange: (text: string) => void; actions: LineActions }) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef({ onChange, actions })
  cb.current = { onChange, actions }
  useEffect(() => {
    const plugin = ViewPlugin.fromClass(
      class {
        deco: DecorationSet
        constructor(v: EditorView) { this.deco = build(v, handlers) }
        update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.deco = build(u.view, handlers) }
      },
      { decorations: (p) => p.deco, provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.deco ?? Decoration.none) }
    )
    const handlers: LineActions = { task: (l) => cb.current.actions.task(l), subtask: (l) => cb.current.actions.subtask(l), ask: (l, a) => cb.current.actions.ask(l, a) }
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          placeholder(hint()),
          plugin,
          EditorView.contentAttributes.of({ 'aria-label': 'Note', spellcheck: 'true' }),
          EditorView.updateListener.of((u) => u.docChanged && cb.current.onChange(u.state.doc.toString()))
        ]
      })
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // The editor is made once; a changed value is put in below.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])
  return <div className="nt-editor" ref={host} />
}
