import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EMPTY_MOD, checkMod, isEmptyMod, type ChatMod, type ChatModState, type LookVersion, type Outcome } from '../shared/chatMod'
import { swatchOf } from '../shared/lookSwatch'

const KEEP = 50

/** What a version is besides the look itself. */
type Meta = Pick<LookVersion, 'n' | 'by' | 'why' | 'at' | 'name'>

/**
 * The look an agent wrote for the chat, on disk as plain files (current.json and current.css, a draft beside them, and every look that was kept before it in history/, one file per version) so a person or an agent can also read them.
 * An agent can only write a draft; only the person's Keep makes it the look, and the system default (no look) is always one switch away.
 * Every kept look is a version with a number it keeps for good; the look in force is one of them, and switching saves the one it leaves.
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
  const asMeta = (m: unknown, fallback: Meta): Meta => {
    const o = m as Partial<Meta> | null
    return o && typeof o === 'object' && Number.isInteger(o.n) && (o.n as number) > 0 ? { n: o.n as number, by: String(o.by ?? '').slice(0, 40), why: String(o.why ?? '').slice(0, 200), at: Number(o.at) || 0, name: String(o.name ?? '').slice(0, 40) } : fallback
  }
  const mtime = (file: string) => {
    try {
      return statSync(file).mtimeMs
    } catch {
      return 0
    }
  }
  const files = () => {
    try {
      return readdirSync(hist).filter((f) => f.endsWith('.json')).sort()
    } catch {
      return []
    }
  }
  // A look kept before versions existed has no author and takes its number from its file's.
  // ponytail: every state() reads each kept file (fifty at most); cache by file name if that is ever slow.
  const entry = (f: string) => {
    try {
      const j = JSON.parse(readFileSync(join(hist, f), 'utf8')) as { layout?: { rules?: unknown }; css?: unknown; widgets?: unknown; meta?: unknown }
      return { file: f, mod: checkMod({ layout: j.layout?.rules, css: j.css, widgets: j.widgets }).mod, meta: asMeta(j.meta, { n: parseInt(f, 10), by: '', why: '', at: mtime(join(hist, f)), name: '' }) }
    } catch {
      return null
    }
  }
  const entries = () => files().map(entry).filter((e): e is NonNullable<ReturnType<typeof entry>> => !!e)

  let current = asMod(read('current.json'), text('current.css'))
  // The look in force is a version too (unless it is the system look), under the number it was kept with.
  let curMeta: Meta | null = isEmptyMod(current)
    ? null
    : asMeta((read('current.json') as { meta?: unknown } | null)?.meta, { n: Math.max(0, ...entries().map((e) => e.meta.n)) + 1, by: '', why: '', at: mtime(join(dir, 'current.json')), name: '' })
  const dj = read('draft.json') as { layout?: unknown; by?: string; why?: string } | null
  let draft: ChatMod | null = dj ? asMod(dj, text('draft.css')) : null
  let by = dj?.by ?? null
  let why = dj?.why ?? ''
  // A draft's widgets load nothing from the internet until the person says so (or keeps it).
  let draftData = false
  // What the person answered, newest first: an agent cannot see the buttons pressed, and one that is not told Undo was pressed takes the empty look for a lost draft and writes the change in again.
  const OUTCOMES = ['kept', 'undone', 'restored the system look', 'switched']
  const stored = read('outcomes.json')
  let recent: Outcome[] = (Array.isArray(stored) ? stored : [])
    .filter((o): o is Outcome => !!o && typeof o === 'object' && OUTCOMES.includes((o as Outcome).outcome) && typeof (o as Outcome).at === 'number')
    .slice(0, 8)
    .map((o) => ({ at: o.at, outcome: o.outcome, by: String(o.by ?? '').slice(0, 40), why: String(o.why ?? '').slice(0, 200), ...(Number.isInteger(o.n) ? { n: o.n } : {}) }))
  const record = (outcome: Outcome['outcome'], by: string, why: string, n?: number) => {
    recent = [{ at: Date.now(), outcome, by, why, ...(n === undefined ? {} : { n }) }, ...recent].slice(0, 8)
    write('outcomes.json', JSON.stringify(recent))
  }
  const said = (o: Outcome) =>
    o.outcome === 'undone'
      ? `the person pressed Undo on ${o.by}'s draft "${o.why}": they did not want it, so it is not in force and must not be written in again unless they ask`
      : o.outcome === 'kept'
        ? `the person kept ${o.by}'s draft "${o.why}": it is in force now`
        : o.outcome === 'restored the system look'
          ? 'the person restored the system look: nothing of any earlier look is in force'
          : `the person switched to version ${o.n} (${o.by ? `${o.by}'s ` : ''}"${o.why}"): the look they left is not in force and must not be written in again unless they ask`

  const saveCurrent = () => {
    if (isEmptyMod(current)) (drop('current.json'), drop('current.css'))
    else (write('current.json', JSON.stringify({ layout: current.layout, widgets: current.widgets, meta: curMeta }, null, 2)), write('current.css', current.css))
  }
  const dropDraft = () => {
    draft = null
    by = null
    why = ''
    draftData = false
    drop('draft.json')
    drop('draft.css')
  }
  const nextN = () => Math.max(curMeta?.n ?? 0, ...files().map((f) => entry(f)?.meta.n ?? 0)) + 1
  const put = (m: ChatMod, meta: Meta) => {
    mkdirSync(hist, { recursive: true })
    writeFileSync(join(hist, `${String(meta.n).padStart(6, '0')}.json`), JSON.stringify({ ...m, meta }))
  }
  /** The look in force goes to history as its own version; over the cap the oldest one with no name of the person's goes. */
  const shelve = () => {
    if (!curMeta || isEmptyMod(current)) return
    put(current, curMeta)
    const all = entries()
    // The look about to be in force takes the last place, so history holds one fewer.
    for (const old of all.filter((e) => !e.meta.name).slice(0, Math.max(0, all.length - (KEEP - 1)))) rmSync(join(hist, old.file), { force: true })
  }
  const find = (n: number) => entries().find((e) => e.meta.n === n)
  // Every change gets a number, and each agent has the number of the look it last read: a write from an older picture is refused (an agent that was not told the person pressed Undo or Keep would write its old idea back in).
  let rev = 0
  const seen = new Map<string, number>()
  const changed = () => (rev++, listeners.forEach((l) => l()))
  const STALE = 'The look changed since you last read it (the person pressed Keep or Undo, restored it, or another agent wrote), or you have not read it yet. Call chat_mod_get to see what is in force now, then write again from that.'
  const stale = () => (recent[0] ? `${STALE} Most recently, ${said(recent[0])}.` : STALE)
  const version = (mod: ChatMod, meta: Meta, active: boolean): LookVersion => ({ ...meta, active, cssBytes: mod.css.length, rules: mod.layout.rules.length, widgets: mod.widgets.length, swatch: swatchOf(mod.css) })

  return {
    state(): ChatModState {
      const versions = [...entries().map((e) => version(e.mod, e.meta, false)), ...(curMeta ? [version(current, curMeta, true)] : [])].sort((a, b) => b.n - a.n)
      return { current, draft, draftBy: by, draftWhy: why, versions, draftData, recent }
    },
    /** An agent has read the look: its next write is judged against what it saw. */
    read(who: string) {
      seen.set(who, rev)
    },
    /** An agent's version, kept as a draft; what could not be read is named and left out. The part it does not mention stays as it is in force. */
    write(i: { layout?: unknown; css?: string; widgets?: unknown; addCss?: string; addWidgets?: unknown; removeWidgets?: unknown; reset?: boolean; by: string; who?: string; why: string }): { problems: string[] } {
      if (i.who !== undefined && seen.get(i.who) !== rev) return { problems: [stale()] }
      if (i.reset) {
        draft = EMPTY_MOD
        draftData = false
        by = i.by
        why = i.why
        write('draft.json', JSON.stringify({ layout: { rules: [] }, widgets: [], by, why }))
        write('draft.css', '')
        changed()
        if (i.who !== undefined) seen.set(i.who, rev)
        return { problems: [] }
      }
      const base = draft ?? current
      // Adding changes only what is added: nothing has to be carried over, so nothing that is not in force can come back with it.
      if (i.css !== undefined && i.addCss !== undefined) return { problems: ['Give css (the whole stylesheet) or addCss (only what to add), not both.'] }
      if (i.widgets !== undefined && (i.addWidgets !== undefined || i.removeWidgets !== undefined)) return { problems: ['Give widgets (the whole list) or addWidgets / removeWidgets (only the change), not both.'] }
      const css = i.css !== undefined ? i.css : i.addCss ? (base.css ? `${base.css}\n${i.addCss}` : i.addCss) : base.css
      let widgets: unknown = i.widgets
      if (widgets === undefined) {
        const keep = new Map<string, unknown>(base.widgets.map((w) => [w.id, w]))
        for (const id of Array.isArray(i.removeWidgets) ? i.removeWidgets : []) keep.delete(String(id))
        const unnamed: unknown[] = []
        for (const a of Array.isArray(i.addWidgets) ? i.addWidgets : []) {
          const id = (a as { id?: unknown } | null)?.id
          if (typeof id === 'string') keep.set(id, a)
          else unnamed.push(a)
        }
        widgets = [...keep.values(), ...unnamed]
      }
      const c = checkMod({ layout: i.layout === undefined ? base.layout.rules : i.layout, css, widgets })
      // Nothing is half-applied: an agent that wrote something unreadable fixes it and writes again.
      if (c.problems.length) return { problems: c.problems }
      draft = c.mod
      draftData = false
      by = i.by
      why = i.why
      write('draft.json', JSON.stringify({ layout: draft.layout, widgets: draft.widgets, by, why }))
      write('draft.css', draft.css)
      changed()
      if (i.who !== undefined) seen.set(i.who, rev)
      return { problems: c.problems }
    },
    /** The person keeps the draft: it becomes a new version, in force, and the one it replaced stays as a version. */
    keep() {
      if (!draft) return
      record('kept', by ?? 'An agent', why)
      shelve()
      const n = nextN()
      current = draft
      curMeta = isEmptyMod(current) ? null : { n, by: by ?? '', why, at: Date.now(), name: '' }
      dropDraft()
      saveCurrent()
      changed()
    },
    /** The person lets the draft's widgets load their data now, before deciding to keep it. */
    loadData() {
      if (!draft || draftData) return
      draftData = true
      changed()
    },
    /** The person throws the draft away. */
    undo() {
      if (!draft) return
      record('undone', by ?? 'An agent', why)
      dropDraft()
      changed()
    },
    /** Puts a version (or the system look) in force at once. The look it leaves is saved as a version first, and a draft waiting is dropped. False when there is no such version or it is already in force. */
    switchTo(target: number | 'system'): boolean {
      if (target === 'system') {
        if (isEmptyMod(current)) return false
        record('restored the system look', 'the person', '')
        dropDraft()
        shelve()
        current = EMPTY_MOD
        curMeta = null
      } else {
        const e = curMeta?.n === target ? undefined : find(target)
        if (!e) return false
        record('switched', e.meta.by, e.meta.why, e.meta.n)
        dropDraft()
        // Its file goes first: saving the look left may drop the oldest, and that must not be the one being put in force.
        rmSync(join(hist, e.file), { force: true })
        shelve()
        current = e.mod
        curMeta = e.meta
      }
      saveCurrent()
      changed()
      return true
    },
    /** The person's own name for a version ('' takes it away). */
    rename(n: number, name: string): boolean {
      const label = name.trim().slice(0, 40)
      if (curMeta?.n === n) {
        curMeta = { ...curMeta, name: label }
        saveCurrent()
      } else {
        const e = find(n)
        if (!e) return false
        put(e.mod, { ...e.meta, name: label })
      }
      changed()
      return true
    },
    /** Deletes a version; the one in force cannot be. */
    remove(n: number): boolean {
      const e = curMeta?.n === n ? undefined : find(n)
      if (!e) return false
      rmSync(join(hist, e.file), { force: true })
      changed()
      return true
    },
    onChange(cb: () => void) {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    }
  }
}
