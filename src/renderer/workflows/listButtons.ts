export interface ListButtons {
  makeDefault: boolean
  /** What goes in the More menu, in order. */
  more: ('copyProject' | 'copyGlobal' | 'delete')[]
}

/** Which buttons the selected workflow gets besides Edit and Rename: the built-in Standard is deleted like any other. */
export function listButtons(o: { isDefault: boolean; hasFolder: boolean }): ListButtons {
  return { makeDefault: o.hasFolder && !o.isDefault, more: ['copyProject', 'copyGlobal', 'delete'] }
}

/** The builder page's title, and how far its draft has got: a new workflow, or the one being edited. */
export function builderHeading(o: { editing?: string; view: { saved: unknown; same: boolean; edited: boolean } | null | undefined }): { title: string; status: string } {
  const title = o.editing ? `Editing ${o.editing}` : 'New workflow'
  const v = o.view
  const status = o.editing && (!v || (v.same && !v.edited)) ? 'no changes yet' : v ? (v.saved ? 'proposed a change' : 'proposed a new workflow') : 'no draft yet'
  return { title, status }
}

/** The saved workflow of this id that an edit replaces: a file of the project or for everything wins over the built-in one it overrides. */
export function savedEntry<T extends { id: string; scope: string }>(list: T[], id: string): T | undefined {
  const same = list.filter((e) => e.id === id)
  return same.find((e) => e.scope !== 'built-in') ?? same[0]
}
