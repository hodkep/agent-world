/** The project each open window is showing. A window nobody has chosen for yet has none, which is when it offers the picker. */
export class WindowWorkspaces {
  private chosen = new Map<number, string>()

  get = (id: number) => this.chosen.get(id) ?? null
  set = (id: number, path: string) => void this.chosen.set(id, path)
  drop = (id: number) => void this.chosen.delete(id)

  /** A forgotten project is no longer open anywhere: its windows go back to choosing. */
  forget(path: string) {
    for (const [id, p] of this.chosen) if (p === path) this.chosen.delete(id)
  }

  showing = (path: string) => [...this.chosen].filter(([, p]) => p === path).map(([id]) => id)
}
