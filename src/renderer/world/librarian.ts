import type { Pt, Step } from './staff'

/** What the librarian can be asked to do. A fetch, a shelving and a dusting happen at a tile in front of a shelf. */
export type Beat = { kind: 'fetch' | 'shelve' | 'dust'; at: Pt } | { kind: 'ledger' | 'tap' | 'shush' }
type Kind = Beat['kind']

const ORDER: Kind[] = ['fetch', 'shelve', 'ledger', 'tap', 'shush', 'dust']
// A reader is at the shelf for about six seconds: a book she cannot bring in time is not brought.
const FRESH: Record<Kind, number> = { fetch: 4000, shelve: 60_000, ledger: 60_000, tap: 60_000, shush: 60_000, dust: 60_000 }
const COOLDOWN: Partial<Record<Kind, number>> = { ledger: 20_000, tap: 600_000 }
const MAX_SHELVE = 3

/** The wishes waiting for the librarian, served one at a time by usefulness, each dropped when it is too old to matter. */
export class LibrarianDesk {
  private wishes: { beat: Beat; at: number }[] = []
  private last = new Map<Kind, number>()

  want(beat: Beat, now: number) {
    if (beat.kind === 'fetch') this.wishes = this.wishes.filter((w) => w.beat.kind !== 'fetch')
    if (beat.kind === 'shelve' && this.wishes.filter((w) => w.beat.kind === 'shelve').length >= MAX_SHELVE) return
    if (beat.kind !== 'shelve' && this.wishes.some((w) => w.beat.kind === beat.kind)) return
    this.wishes.push({ beat, at: now })
  }

  next(now: number): Beat | null {
    this.wishes = this.wishes.filter((w) => now - w.at <= FRESH[w.beat.kind])
    for (const kind of ORDER) {
      const i = this.wishes.findIndex((w) => w.beat.kind === kind)
      if (i < 0) continue
      const cool = COOLDOWN[kind]
      if (cool && now - (this.last.get(kind) ?? -Infinity) < cool) {
        this.wishes.splice(i, 1)
        continue
      }
      this.last.set(kind, now)
      return this.wishes.splice(i, 1)[0]!.beat
    }
    return null
  }
}

const wait = (ms: number, more: Omit<Extract<Step, { kind: 'wait' }>, 'kind' | 'ms'> = {}): Step => ({ kind: 'wait', ms, ...more })
const home = (stand: Pt): Step[] => [{ kind: 'walk', to: stand }, wait(600, { face: 'up' })]

/** Her steps for one beat, from her place behind the lectern and back to it. */
export function beatSteps(b: Beat, stand: Pt): Step[] {
  switch (b.kind) {
    case 'fetch':
      return [{ kind: 'walk', to: b.at }, wait(1200, { prop: 'book', pose: 'hold', face: 'up' }), wait(2600, { face: 'up' }), wait(800, { prop: 'book', pose: 'hold', face: 'up' }), ...home(stand)]
    case 'shelve':
      return [wait(500, { prop: 'book', pose: 'hold' }), { kind: 'walk', to: b.at }, wait(1000, { prop: 'book', pose: 'reach', face: 'up' }), ...home(stand)]
    case 'dust':
      return [{ kind: 'walk', to: b.at }, wait(1800, { prop: 'cloth', pose: 'wipe', face: 'up' }), ...home(stand)]
    case 'ledger':
      return [wait(1800, { face: 'up', pose: 'chin' })]
    case 'tap':
      return [wait(1400, { pose: 'reach', face: 'up' }), wait(400, { face: 'up' })]
    case 'shush':
      return [wait(2200, { say: 'Shh!', face: 'right', pose: 'point' })]
  }
}

/** The tile beside a reader at a shelf where she stands to hand the book over: the next one along, or the one before. */
export function besideShelf(spot: Pt, free: (p: Pt) => boolean): Pt {
  for (const dx of [1, -1, 2, -2]) {
    const p = { x: spot.x + dx, y: spot.y }
    if (free(p)) return p
  }
  return spot
}

/** Which slot on the shelves an item's spine takes: always the same one for the same item. */
export function shelfSlot(id: string, slots: number): number {
  let h = 0
  for (const c of id) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0
  return h % slots
}

/** The three most used items glow; the ones not used in the last thirty days gather dust. */
export function libraryMarks(ids: string[], usage: Record<string, { used: number }>) {
  const used = ids.filter((id) => (usage[id]?.used ?? 0) > 0).sort((a, b) => usage[b]!.used - usage[a]!.used)
  return { glow: used.slice(0, 3), dusty: ids.filter((id) => !(usage[id]?.used ?? 0)) }
}

const DAY = 86_400_000

/** Items that first showed up less than a day ago. The first look sees everything as already there. `seen` is what to keep for next time. */
export function freshItems(ids: string[], seen: Record<string, number> | null, now: number) {
  const next: Record<string, number> = { ...(seen ?? {}) }
  for (const id of ids) if (!(id in next)) next[id] = seen ? now : 0
  return { fresh: ids.filter((id) => next[id]! > 0 && now - next[id]! < DAY), seen: next }
}
