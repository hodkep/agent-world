import { describe, expect, it } from 'vitest'
import { builderHeading, listButtons, savedEntry } from './listButtons'

const base = { scope: 'project' as const, isDefault: false, removedHere: false, hasFolder: true }

describe('the buttons under the selected workflow', () => {
  it('make default is offered for one that is not the default, and delete for one that is not built in', () => {
    expect(listButtons(base)).toEqual({ restore: false, makeDefault: true, more: ['copyProject', 'copyGlobal', 'delete'] })
    expect(listButtons({ ...base, isDefault: true }).makeDefault).toBe(false)
  })
  it('the built-in one can be removed for the project, not deleted', () => {
    expect(listButtons({ ...base, scope: 'built-in' }).more).toEqual(['copyProject', 'copyGlobal', 'remove'])
  })
  it('a built-in one removed for this project is restored, and cannot be made the default or removed again', () => {
    expect(listButtons({ ...base, scope: 'built-in', removedHere: true })).toEqual({ restore: true, makeDefault: false, more: ['copyProject', 'copyGlobal'] })
  })
  it('with no project open there is nothing to make default, restore or remove', () => {
    expect(listButtons({ ...base, scope: 'built-in', hasFolder: false })).toEqual({ restore: false, makeDefault: false, more: ['copyProject', 'copyGlobal'] })
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
