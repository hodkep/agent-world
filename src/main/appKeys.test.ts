import { describe, expect, it } from 'vitest'
import { appKey, type KeyInput } from './appKeys'

// A key press as Electron reports it for a web page in a webview.
const press = (key: string, code: string, mods: Partial<Record<'meta' | 'control' | 'alt' | 'shift', boolean>> = {}, type = 'keyDown'): KeyInput => ({ type, key, code, meta: false, control: false, alt: false, shift: false, ...mods })

describe('which key presses over a web page in Preview belong to the app', () => {
  it('takes Mod+Alt+1 to 9, the side panel tabs, read from the key (Option+1 types ¡ on a Mac)', () => {
    for (let n = 1; n <= 9; n++) expect(appKey(press('¡', `Digit${n}`, { meta: true, alt: true }))).toBe(true)
    expect(appKey(press('1', 'Digit1', { control: true, alt: true }))).toBe(true)
  })

  it('takes the other Mod+Alt shortcuts: office, sleep, the latest message', () => {
    expect(appKey(press('ø', 'KeyO', { meta: true, alt: true }))).toBe(true)
    expect(appKey(press('ß', 'KeyS', { meta: true, alt: true }))).toBe(true)
    expect(appKey(press('ArrowDown', 'ArrowDown', { meta: true, alt: true }))).toBe(true)
  })

  it('takes Cmd+K (the palette) and Cmd+/ (the shortcuts sheet), as asked', () => {
    expect(appKey(press('k', 'KeyK', { meta: true }))).toBe(true)
    expect(appKey(press('/', 'Slash', { meta: true }))).toBe(true)
    expect(appKey(press('k', 'KeyK', { control: true }))).toBe(true)
  })

  it('leaves everything else to the page: copy, find, Esc, plain keys, Alt alone, Cmd with a digit, shifted combinations', () => {
    expect(appKey(press('c', 'KeyC', { meta: true }))).toBe(false)
    expect(appKey(press('f', 'KeyF', { meta: true }))).toBe(false)
    expect(appKey(press('Escape', 'Escape'))).toBe(false)
    expect(appKey(press('1', 'Digit1'))).toBe(false)
    expect(appKey(press('¡', 'Digit1', { alt: true }))).toBe(false)
    expect(appKey(press('1', 'Digit1', { meta: true }))).toBe(false)
    expect(appKey(press('K', 'KeyK', { meta: true, shift: true }))).toBe(false)
    expect(appKey(press('ø', 'KeyO', { meta: true, alt: true, shift: true }))).toBe(false)
  })

  it('looks at the press, not its release', () => {
    expect(appKey(press('¡', 'Digit1', { meta: true, alt: true }, 'keyUp'))).toBe(false)
  })
})
