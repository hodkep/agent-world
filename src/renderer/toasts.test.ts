import { beforeEach, describe, expect, it } from 'vitest'
import { dismissToast, resetToasts, toast, toasts } from './toasts'

beforeEach(resetToasts)

describe('toasts', () => {
  it('adds one toast per message: the same message again is not stacked, and only the newest few stay', () => {
    toast('It is not in a skills folder.')
    toast('It is not in a skills folder.')
    expect(toasts()).toHaveLength(1)
    for (let i = 0; i < 6; i++) toast(`message ${i}`)
    expect(toasts().map((t) => t.text)).toEqual(['message 2', 'message 3', 'message 4', 'message 5'])
  })
  it('keeps the tone, and removes one toast when it is dismissed', () => {
    toast('Deleted chirp.', 'ok')
    toast('Could not delete.')
    expect(toasts().map((t) => t.tone)).toEqual(['ok', 'bad'])
    dismissToast(toasts()[0]!.id)
    expect(toasts().map((t) => t.text)).toEqual(['Could not delete.'])
  })
  it('cleans an error from the main process down to its words', () => {
    toast(new Error("Error invoking remote method 'library:delete': Error: Nothing here."))
    expect(toasts()[0]!.text).toBe('Nothing here.')
  })
})
