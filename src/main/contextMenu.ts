import type { MenuItemConstructorOptions } from 'electron'

export interface ContextParams {
  isEditable: boolean
  selectionText: string
  linkURL: string
  /** 'image' when the pointer is on a picture. */
  mediaType?: string
  editFlags: { canUndo: boolean; canRedo: boolean; canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean }
}

const SEP: MenuItemConstructorOptions = { type: 'separator' }

/** What a right-click offers, using the system's own commands so it feels like any other Mac app. */
export function contextItems(p: ContextParams, copyLink: (url: string) => void = () => {}, copyImage: () => void = () => {}): MenuItemConstructorOptions[] {
  const f = p.editFlags
  const items: MenuItemConstructorOptions[] = []
  if (p.linkURL) items.push({ label: 'Copy Link', click: () => copyLink(p.linkURL) })
  if (p.mediaType === 'image') items.push({ label: 'Copy Image', click: copyImage })
  if (p.isEditable) {
    const edit: MenuItemConstructorOptions[] = [f.canUndo && { role: 'undo' }, f.canRedo && { role: 'redo' }].filter(Boolean) as MenuItemConstructorOptions[]
    const move = [f.canCut && { role: 'cut' }, f.canCopy && { role: 'copy' }, f.canPaste && { role: 'paste' }].filter(Boolean) as MenuItemConstructorOptions[]
    for (const group of [edit, move, f.canSelectAll ? [{ role: 'selectAll' } as MenuItemConstructorOptions] : []]) {
      if (!group.length) continue
      if (items.length) items.push(SEP)
      items.push(...group)
    }
  } else if (p.selectionText) {
    if (items.length) items.push(SEP)
    items.push({ role: 'copy' }, SEP, { role: 'selectAll' })
  }
  return items
}
