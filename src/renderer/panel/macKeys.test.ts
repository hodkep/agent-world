import { describe, expect, it } from 'vitest'
import { macKeySequence } from './macKeys'

const key = (k: string, mods: Partial<Pick<KeyboardEvent, 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey'>> = {}) => ({ type: 'keydown', key: k, metaKey: false, altKey: false, ctrlKey: false, shiftKey: false, ...mods })

describe('macKeySequence', () => {
  it('sends back-word and forward-word for Option+Left / Option+Right', () => {
    expect(macKeySequence(key('ArrowLeft', { altKey: true }))).toBe('\x1bb')
    expect(macKeySequence(key('ArrowRight', { altKey: true }))).toBe('\x1bf')
  })

  it('deletes to line start for Cmd+Backspace and a word for Option+Backspace', () => {
    expect(macKeySequence(key('Backspace', { metaKey: true }))).toBe('\x15')
    expect(macKeySequence(key('Backspace', { altKey: true }))).toBe('\x1b\x7f')
  })

  it('leaves plain keys, other combinations and key releases alone', () => {
    expect(macKeySequence(key('ArrowLeft'))).toBeNull()
    expect(macKeySequence(key('ArrowLeft', { metaKey: true }))).toBeNull()
    expect(macKeySequence(key('c', { metaKey: true }))).toBeNull()
    expect(macKeySequence({ ...key('ArrowLeft', { altKey: true }), type: 'keyup' })).toBeNull()
  })
})
