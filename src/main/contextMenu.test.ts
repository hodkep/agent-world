import { describe, expect, it } from 'vitest'
import { contextItems } from './contextMenu'

const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: true }
const p = (o: object) => ({ isEditable: false, selectionText: '', linkURL: '', editFlags: flags, ...o })
const roles = (o: object) => contextItems(p(o)).map((i) => ('role' in i ? i.role : i.type === 'separator' ? '-' : i.label))

describe('the right-click menu', () => {
  it('offers nothing on plain ground', () => {
    expect(roles({})).toEqual([])
  })
  it('offers copy for selected text', () => {
    expect(roles({ selectionText: 'hello' })).toEqual(['copy', '-', 'selectAll'])
  })
  it('offers the editing commands in a text box, leaving out what cannot be done now', () => {
    expect(roles({ isEditable: true })).toEqual(['undo', '-', 'cut', 'copy', 'paste', '-', 'selectAll'])
    expect(roles({ isEditable: true, editFlags: { ...flags, canCut: false, canCopy: false, canUndo: false } })).toEqual(['paste', '-', 'selectAll'])
  })
  it('offers copying a link', () => {
    expect(roles({ linkURL: 'http://localhost:3000/' })).toEqual(['Copy Link'])
  })
})
