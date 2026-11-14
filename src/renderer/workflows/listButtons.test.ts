import { describe, expect, it } from 'vitest'
import { builderHeading, listButtons, savedEntry } from './listButtons'

const base = { isDefault: false, hasFolder: true }

describe('the buttons under the selected workflow', () => {
  it('make default is offered for one that is not the default, and every workflow can be copied and deleted', () => {
    expect(listButtons(base)).toEqual({ makeDefault: true, more: ['copyProject', 'copyGlobal', 'delete'] })
    expect(listButtons({ ...base, isDefault: true }).makeDefault).toBe(false)
  })
  it('with no project open there is nothing to make default, and the file actions stay', () => {
    expect(listButtons({ ...base, hasFolder: false })).toEqual({ makeDefault: false, more: ['copyProject', 'copyGlobal', 'delete'] })
  })
})

describe('what the builder page says it is about', () => {
  it('is a new workflow, or the one being edited', () => {
    expect(builderHeading({ view: null })).toEqual({ title: 'New workflow', status: 'no draft yet' })
    expect(builderHeading({ editing: 'Standard', view: null })).toEqual({ title: 'Editing Standard', status: 'no changes yet' })
  })
  it('says what has been proposed', () => {
    expect(builderHeading({ view: { saved: false, same: false, edited: false } })).toEqual({ title: 'New workflow', status: 'proposed a new workflow' })
    expect(builderHeading({ editing: 'Standard', view: { saved: true, same: false, edited: false } })).toEqual({ title: 'Editing Standard', status: 'proposed a change' })
    expect(builderHeading({ editing: 'Standard', view: { saved: true, same: true, edited: false } }).status).toBe('no changes yet')
    expect(builderHeading({ editing: 'Standard', view: { saved: true, same: true, edited: true } }).status).toBe('proposed a change')
  })
})

describe('the saved workflow an edit started from', () => {
  it('is the one the editor saves over: a file in the project or for everything before the built-in one with the same id', () => {
    const list = [{ id: 'standard', scope: 'built-in' }, { id: 'standard', scope: 'project' }, { id: 'quick', scope: 'global' }]
    expect(savedEntry(list, 'standard')).toBe(list[1])
    expect(savedEntry(list, 'quick')).toBe(list[2])
    expect(savedEntry(list, 'nope')).toBeUndefined()
  })
})
