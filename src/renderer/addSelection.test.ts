import { describe, expect, it } from 'vitest'
import { ADD_SELECTION_EVENT, requestAddSelection } from './addSelection'

describe('asking a place to take the selection into the message box', () => {
  const bus = new EventTarget()
  it('says handled when a place that shows its Ask button takes it', () => {
    const take = (e: Event) => ((e as CustomEvent<{ handled: boolean }>).detail.handled = true)
    bus.addEventListener(ADD_SELECTION_EVENT, take)
    expect(requestAddSelection(bus)).toBe(true)
    bus.removeEventListener(ADD_SELECTION_EVENT, take)
  })

  it('says not handled when no place has a selection, so the key is left alone', () => {
    expect(requestAddSelection(bus)).toBe(false)
  })

  it('lets only the first of several listeners take it, as with one agent open in two cells', () => {
    let taken = 0
    const once = (e: Event) => {
      const d = (e as CustomEvent<{ handled: boolean }>).detail
      if (d.handled) return
      d.handled = true
      taken++
    }
    bus.addEventListener(ADD_SELECTION_EVENT, once)
    bus.addEventListener(ADD_SELECTION_EVENT, once)
    requestAddSelection(bus)
    bus.removeEventListener(ADD_SELECTION_EVENT, once)
    expect(taken).toBe(1)
  })
})
