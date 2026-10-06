export interface Shout {
  text: string
  x: number
  y: number
}

interface Item {
  id: string
  text: string
  left: number
  at: () => { x: number; y: number } | null
}

/** Short shouts over people ("HELP!"): each lasts a set time and follows whoever it is over. */
export class Shouts {
  private items: Item[] = []

  get size() {
    return this.items.length
  }

  /** A shout with this id that is still going is left alone, so a burst of the same cry is one cry. */
  say(id: string, text: string, ms: number, at: Item['at']) {
    if (this.items.some((i) => i.id === id)) return
    this.items.push({ id, text, left: ms, at })
  }

  update(dtMs: number) {
    for (const i of this.items) i.left -= dtMs
    this.items = this.items.filter((i) => i.left > 0 && i.at() !== null)
  }

  active(): Shout[] {
    return this.items.flatMap((i) => {
      const p = i.at()
      return p ? [{ text: i.text, x: p.x, y: p.y }] : []
    })
  }
}
