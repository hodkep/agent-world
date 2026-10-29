// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { jumpsToLatest, typingIn } from './shortcuts'

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, ...init })
const el = (html: string) => {
  document.body.innerHTML = html
  return document.body.firstElementChild as Element
}

describe('typing in something', () => {
  it('is true in a text box, a text area, a menu of choices and an editor', () => {
    for (const html of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>', '<div contenteditable="true"><span id="x">a</span></div>'])
      expect(typingIn(el(html).querySelector('#x') ?? el(html)), html).toBe(true)
  })
  it('is false on a button, the page, or nothing', () => {
    expect(typingIn(el('<button></button>'))).toBe(false)
    expect(typingIn(document.body)).toBe(false)
    expect(typingIn(null)).toBe(false)
  })
})

describe('the jump to the latest message', () => {
  it('Mod+Alt+↓ always jumps, even in a text box where Cmd+↓ is the caret\'s', () => {
    expect(jumpsToLatest(press({ metaKey: true, altKey: true }), el('<textarea></textarea>'))).toBe(true)
  })
  it('Cmd+↓ jumps unless something is being typed in', () => {
    expect(jumpsToLatest(press({ metaKey: true }), el('<button></button>'))).toBe(true)
    expect(jumpsToLatest(press({ metaKey: true }), document.body)).toBe(true)
    expect(jumpsToLatest(press({ metaKey: true }), el('<textarea></textarea>'))).toBe(false)
    expect(jumpsToLatest(press({ metaKey: true }), el('<div contenteditable="true"></div>'))).toBe(false)
  })
  it('other keys do not', () => {
    expect(jumpsToLatest(press({}), document.body)).toBe(false)
    expect(jumpsToLatest(press({ key: 'ArrowUp', metaKey: true }), document.body)).toBe(false)
  })
})
