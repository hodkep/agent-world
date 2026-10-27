import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMPTY_MOD, checkMod, isEmptyMod, type ChatMod, type ChatModState } from '../shared/chatMod'

const KEEP = 20

/**
 * The look an agent wrote for the chat, on disk as plain files (current.json and current.css, a draft beside them, and the looks before in history/) so a person or an agent can also read them.
 * An agent can only write a draft; only the person's Keep makes it the look, and the system default (no look) is always one reset away.
 */
export function createChatMod(dir: string) {
  const hist = join(dir, 'history')
  const listeners = new Set<() => void>()
  const read = (file: string): unknown => {
    try {
      return JSON.parse(readFileSync(join(dir, file), 'utf8'))
    } catch {
      return null
    }
  }
  const text = (file: string) => {
    try {
      return readFileSync(join(dir, file), 'utf8')
    } catch {
      return ''
    }
  }
  const write = (file: string, body: string) => {
    mkdirSync(dir, { recursive: true })
    const tmp = join(dir, `${file}.tmp`)
    writeFileSync(tmp, body)
    renameSync(tmp, join(dir, file))
  }
  const drop = (file: string) => rmSync(join(dir, file), { force: true })
  const asMod = (j: unknown, css: string): ChatMod => checkMod({ layout: (j as { layout?: { rules?: unknown } } | null)?.layout?.rules, css, widgets: (j as { widgets?: unknown } | null)?.widgets }).mod

  let current = asMod(read('current.json'), text('current.css'))
  const dj = read('draft.json') as { layout?: unknown; by?: string; why?: string } | null
  let draft: ChatMod | null = dj ? asMod(dj, text('draft.css')) : null
  let by = dj?.by ?? null
  let why = dj?.why ?? ''

  const saveCurrent = () => {
    if (isEmptyMod(current)) (drop('current.json'), drop('current.css'))
    else (write('current.json', JSON.stringify({ layout: current.layout, widgets: current.widgets }, null, 2)), write('current.css', current.css))
  }
  const dropDraft = () => {
    draft = null
    by = null
    why = ''
    drop('draft.json')
    drop('draft.css')
  }
  const files = () => {
    try {
      return readdirSync(hist).filter((f) => f.endsWith('.json')).sort()
    } catch {
      return []
    }
  }
  const push = (m: ChatMod) => {
    mkdirSync(hist, { recursive: true })
    const last = files().at(-1)
    const n = last ? parseInt(last, 10) + 1 : 1
    writeFileSync(join(hist, `${String(n).padStart(6, '0')}.json`), JSON.stringify(m))
    for (const old of files().slice(0, -KEEP)) rmSync(join(hist, old), { force: true })
  }
  // Every change gets a number, and each agent has the number of the look it last read: a write from an older picture is refused (an agent that was not told the person pressed Undo or Keep would write its old idea back in).
  let rev = 0
  const seen = new Map<string, number>()
  const changed = () => (rev++, listeners.forEach((l) => l()))
  const STALE = 'The look changed since you last read it (the person pressed Keep or Undo, restored it, or another agent wrote), or you have not read it yet. Call chat_mod_get to see what is in force now, then write again from that.'

  return {
    state(): ChatModState {
      return { current, draft, draftBy: by, draftWhy: why, history: files().length }
    },
    /** An agent's version, kept as a draft; what could not be read is named and left out. The part it does not mention stays as it is in force. */
    /** An agent has read the look: its next write is judged against what it saw. */
    read(who: string) {
      seen.set(who, rev)
    },
    write(i: { layout?: unknown; css?: string; widgets?: unknown; reset?: boolean; by: string; who?: string; why: string }): { problems: string[] } {
      if (i.who !== undefined && seen.get(i.who) !== rev) return { problems: [STALE] }
      if (i.reset) {
        draft = EMPTY_MOD
        by = i.by
        why = i.why
        write('draft.json', JSON.stringify({ layout: { rules: [] }, widgets: [], by, why }))
        write('draft.css', '')
        changed()
        if (i.who !== undefined) seen.set(i.who, rev)
        return { problems: [] }
      }
      const base = draft ?? current
      const c = checkMod({ layout: i.layout === undefined ? base.layout.rules : i.layout, css: i.css === undefined ? base.css : i.css, widgets: i.widgets === undefined ? base.widgets : i.widgets })
      // Nothing is half-applied: an agent that wrote something unreadable fixes it and writes again.
      if (c.problems.length) return { problems: c.problems }
      draft = c.mod
      by = i.by
      why = i.why
      write('draft.json', JSON.stringify({ layout: draft.layout, widgets: draft.widgets, by, why }))
      write('draft.css', draft.css)
      changed()
      if (i.who !== undefined) seen.set(i.who, rev)
      return { problems: c.problems }
    },
    /** The person keeps the draft: the look before it goes to history. */
    keep() {
      if (!draft) return
      push(current)
      current = draft
      dropDraft()
      saveCurrent()
      changed()
    },
    /** The person throws the draft away. */
    undo() {
      if (!draft) return
      dropDraft()
      changed()
    },
    /** The system default, at once. The look it replaces can be brought back. */
    reset() {
      dropDraft()
      if (!isEmptyMod(current)) push(current)
      current = EMPTY_MOD
      saveCurrent()
      changed()
    },
    /** The look before this one. */
    back() {
      const last = files().at(-1)
      if (!last) return
      const saved = JSON.parse(readFileSync(join(hist, last), 'utf8')) as { layout?: { rules?: unknown }; css?: unknown; widgets?: unknown }
      const prev = checkMod({ layout: saved.layout?.rules, css: saved.css, widgets: saved.widgets })
      rmSync(join(hist, last), { force: true })
      dropDraft()
      current = prev.mod
      saveCurrent()
      changed()
    },
    onChange(cb: () => void) {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    }
  }
}
