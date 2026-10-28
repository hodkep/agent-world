import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { EditorState, Prec, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type ViewUpdate } from '@codemirror/view'
import { continueList, noteLines } from '../../shared/notePlan'
import { hint as keyHint } from '../shortcuts'

export interface LineActions {
  /** Make a task of the line (and the lines indented under it). */
  task: (line: number) => void
  /** Make the line a subtask of the item above it. */
  subtask: (line: number) => void
  ask: (line: number) => void
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

/** What can be done with a line, as buttons in the margin that show on hover. A line that is a task already can only be asked about; a deeper one cannot be a task, only a subtask. */
function lineButtons(l: { todo?: unknown; indent: number }): ('task' | 'subtask' | 'ask')[] {
  return [...(l.todo || l.indent >= 2 ? [] : (['task'] as const)), ...(l.todo ? [] : (['subtask'] as const)), 'ask']
}
const BUTTON = {
  task: { text: 'Task', label: 'Make a task', key: 'note-task' },
  subtask: { text: 'Sub', label: 'Make a subtask', key: 'note-subtask' },
  ask: { text: 'Ask', label: 'Ask an agent', key: 'note-ask' }
} as const

/** The buttons in the margin of a bullet or checklist line. They are outside the words, so the text under the pointer can always be clicked. */
class Handle extends WidgetType {
  constructor(readonly line: number, readonly kinds: ('task' | 'subtask' | 'ask')[], readonly h: LineActions) { super() }
  eq(o: Handle) { return o.line === this.line && o.kinds.join() === this.kinds.join() }
  toDOM() {
    const g = document.createElement('span')
    g.className = 'nt-handle'
    for (const k of this.kinds) {
      const b = document.createElement('button')
      b.textContent = BUTTON[k].text
      b.setAttribute('aria-label', BUTTON[k].label)
      b.className = 'tip-btn'
      b.dataset.tip = keyHint(BUTTON[k].key)
      b.onmousedown = (e) => (e.preventDefault(), this.h[k](this.line))
      g.append(b)
    }
    return g
  }
  ignoreEvent() { return true }
}

// Each Markdown mark in a line: the pattern, the class of the words, and how long its opening and closing marks are.
const INLINE: { re: RegExp; cls: string; open: number; close: (m: RegExpMatchArray) => number }[] = [
  { re: /\*\*[^*\n]+\*\*/g, cls: 'nt-b', open: 2, close: () => 2 },
  { re: /(?<![*\w])\*[^*\n]+\*(?!\*)/g, cls: 'nt-i', open: 1, close: () => 1 },
  { re: /`[^`\n]+`/g, cls: 'nt-code', open: 1, close: () => 1 },
  { re: /~~[^~\n]+~~/g, cls: 'nt-s', open: 2, close: () => 2 },
  { re: /\[[^\]\n]+\]\([^)\n]+\)/g, cls: 'nt-link', open: 1, close: (m) => m[0].length - m[0].indexOf('](') }
]

class Rule extends WidgetType {
  toDOM() { const r = document.createElement('div'); r.className = 'nt-rule'; return r }
}

const hide = Decoration.replace({})

/** The note drawn as it is read, except where the cursor is: there the Markdown marks show so they can be edited, and everywhere else they are hidden (a line of dashes is a rule, # is gone from a heading, ** from bold words). */
function build(view: EditorView, h: LineActions): DecorationSet {
  const text = view.state.doc.toString()
  const lines = noteLines(text)
  const out: Range<Decoration>[] = []
  const sel = view.state.selection.main
  const focused = view.hasFocus
  // The marks of a line, or of one piece of it, show while the cursor or the selection is on it.
  const onRange = (from: number, to: number) => focused && sel.from <= to && sel.to >= from
  for (const l of lines) {
    const line = view.state.doc.line(l.line + 1)
    const raw = line.text
    const here = onRange(line.from, line.to)
    if (l.kind === 'heading') {
      const m = /^(\s*#{1,6}\s+)/.exec(raw)!
      out.push(Decoration.line({ class: `nt-h nt-h${Math.min(m[1]!.trim().length, 3)}` }).range(line.from))
      if (!here) out.push(hide.range(line.from, line.from + m[1]!.length))
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(raw)) {
      if (here) out.push(Decoration.line({ class: 'nt-hr' }).range(line.from))
      else if (line.to > line.from) out.push(Decoration.replace({ widget: new Rule() }).range(line.from, line.to))
      continue
    } else if (/^\s*>/.test(raw)) {
      const m = /^(\s*>\s?)/.exec(raw)!
      out.push(Decoration.line({ class: 'nt-quote' }).range(line.from))
      if (!here) out.push(hide.range(line.from, line.from + m[1]!.length))
    } else if (l.kind === 'item') {
      const m = /^(\s*)([-*+])\s+(?:\[([ xX])\]\s?)?/.exec(raw)!
      const start = line.from + m[1]!.length
      out.push(Decoration.line({ class: `nt-item${l.done ? ' done' : ''}${l.todo ? ' linked' : ''}`, attributes: { style: `padding-left:${m[1]!.length * 5 + 2}px` } }).range(line.from))
      if (m[3] !== undefined) out.push(Decoration.replace({ widget: new Box(l.done, start + 2, 3) }).range(start, start + 2 + 3))
      else out.push(Decoration.replace({ widget: new Dot() }).range(start, start + 1))
      if (l.todo) {
        const at = raw.lastIndexOf('(todo#')
        out.push(Decoration.mark({ class: 'nt-linked' }).range(line.from + at, line.to))
      }
      if (l.title) out.push(Decoration.widget({ widget: new Handle(l.line, lineButtons(l), h), side: 1 }).range(line.to))
    }
    for (const { re, cls, open, close } of INLINE) {
      for (const x of raw.matchAll(re)) {
        const from = line.from + x.index!
        const to = from + x[0].length
        out.push(Decoration.mark({ class: cls }).range(from, to))
        if (!onRange(from, to)) out.push(hide.range(from, from + open), hide.range(to - close(x), to))
        // A link's address is kept as the target of the words.
        if (cls === 'nt-link') out.push(Decoration.mark({ class: 'nt-link', attributes: { title: x[0].slice(x[0].indexOf('](') + 2, -1) } }).range(from + 1, from + x[0].indexOf('](')))
      }
    }
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

/** Runs something on the line the cursor is on, when that line is a bullet or checklist item with words. */
function onLine(v: EditorView, run: (line: number) => void): boolean {
  const n = v.state.doc.lineAt(v.state.selection.main.head).number - 1
  const l = noteLines(v.state.doc.toString())[n]
  if (!l || l.kind !== 'item' || !l.title) return false
  run(n)
  return true
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
        update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged) this.deco = build(u.view, handlers) }
      },
      { decorations: (p) => p.deco, provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.deco ?? Decoration.none) }
    )
    const handlers: LineActions = { task: (l) => cb.current.actions.task(l), subtask: (l) => cb.current.actions.subtask(l), ask: (l) => cb.current.actions.ask(l) }
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Enter in a list item starts the next item (with an empty box in a checklist), and on an empty item ends the list.
          // The same three things the line's menu does, from the keyboard (Ctrl instead of Cmd outside a Mac).
          Prec.high(keymap.of([
            { key: 'Mod-Enter', run: (v) => onLine(v, (l) => handlers.task(l)) },
            { key: 'Shift-Mod-Enter', run: (v) => onLine(v, (l) => handlers.subtask(l)) },
            { key: 'Alt-Mod-Enter', run: (v) => onLine(v, (l) => handlers.ask(l)) }
          ])),
          Prec.high(keymap.of([{
            key: 'Enter',
            run: (v) => {
              const sel = v.state.selection.main
              if (!sel.empty) return false
              const c = continueList(v.state.doc.toString(), sel.head)
              if (!c) return false
              v.dispatch({ changes: { from: c.from, to: c.to, insert: c.insert }, selection: { anchor: c.from + c.insert.length }, userEvent: 'input' })
              return true
            }
          }])),
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
