import { describe, expect, it } from 'vitest'
import { findShortcuts, hint, matches, PLACES, SHORTCUTS, showKey } from './shortcuts'

describe('a key combination as the person sees it', () => {
  it('uses the Mac symbols on a Mac', () => {
    expect(showKey('Mod+K', true)).toBe('⌘K')
    expect(showKey('Shift+Mod+Z', true)).toBe('⇧⌘Z')
    expect(showKey('Alt+ArrowUp', true)).toBe('⌥↑')
    expect(showKey('Ctrl+`', true)).toBe('⌃`')
  })

  it('spells the keys out elsewhere, with Mod meaning Ctrl', () => {
    expect(showKey('Mod+K', false)).toBe('Ctrl+K')
    expect(showKey('Shift+Mod+Z', false)).toBe('Shift+Ctrl+Z')
    expect(showKey('Alt+ArrowUp', false)).toBe('Alt+↑')
    expect(showKey('Ctrl+`', false)).toBe('Ctrl+`')
  })

  it('names the keys that have no symbol the same everywhere', () => {
    expect(showKey('Enter', true)).toBe('Enter')
    expect(showKey('Shift+Enter', false)).toBe('Shift+Enter')
    expect(showKey('Esc', false)).toBe('Esc')
  })
})

describe('finding a shortcut', () => {
  it('matches the description, in any case, and shows where each one works', () => {
    const found = findShortcuts('FIND', null, true)
    expect(found.map((s) => s.place).sort()).toEqual(['Conversation', 'Terminal'])
  })

  it('narrows to one place', () => {
    const found = findShortcuts('', 'Terminal', true)
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((s) => s.place === 'Terminal')).toBe(true)
  })

  it('lists everything for an empty search and nothing for a search that matches nothing', () => {
    expect(findShortcuts('  ', null, true)).toHaveLength(SHORTCUTS.length)
    expect(findShortcuts('zzzz', null, true)).toEqual([])
  })

  it('leaves out what only works on a Mac when the keyboard is not one', () => {
    expect(findShortcuts('', 'Terminal', false).map((s) => s.id)).toEqual(['term-open'])
    expect(findShortcuts('', null, false).length).toBeLessThan(SHORTCUTS.length)
  })

  it('also matches the keys, as the person sees them', () => {
    expect(findShortcuts('⇧Tab', null, true).map((s) => s.id)).toEqual(['cycle-mode'])
  })
})

describe('a key press against the table', () => {
  const press = (key: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods })

  it('takes Cmd or Ctrl for Mod, and any of the shortcut\'s keys', () => {
    expect(matches(press('/', { metaKey: true }), 'shortcuts')).toBe(true)
    expect(matches(press('/', { ctrlKey: true }), 'shortcuts')).toBe(true)
  })

  it('switches agent with Ctrl+Tab and Ctrl+Shift+Tab, on any keyboard', () => {
    expect(matches(press('Tab', { ctrlKey: true }), 'agent-switch')).toBe(true)
    expect(matches(press('Tab', { ctrlKey: true, shiftKey: true }), 'agent-switch')).toBe(true)
    expect(matches(press('Tab'), 'agent-switch')).toBe(false)
    expect(matches(press('Tab', { metaKey: true }), 'agent-switch')).toBe(false)
    expect(matches(press('Tab', { shiftKey: true }), 'cycle-mode')).toBe(true)
  })

  it('adds the selection with Shift+Mod+L, and not with the editor\'s plain Mod+L or another Shift+Mod letter', () => {
    expect(matches(press('L', { metaKey: true, shiftKey: true }), 'add-selection')).toBe(true)
    expect(matches(press('l', { ctrlKey: true, shiftKey: true }), 'add-selection')).toBe(true)
    expect(matches(press('l', { metaKey: true }), 'add-selection')).toBe(false)
    expect(matches(press('k', { metaKey: true, shiftKey: true }), 'add-selection')).toBe(false)
    expect(matches(press('l', { metaKey: true, shiftKey: true, altKey: true }), 'add-selection')).toBe(false)
  })

  it('switches workspace with Shift+Mod+[ and ], read from the key itself so a layout where the bracket needs Shift still matches', () => {
    expect(matches({ ...press('{', { metaKey: true, shiftKey: true }), code: 'BracketLeft' }, 'workspace-switch')).toBe(true)
    expect(matches({ ...press('}', { ctrlKey: true, shiftKey: true }), code: 'BracketRight' }, 'workspace-switch')).toBe(true)
    expect(matches(press('[', { metaKey: true, shiftKey: true }), 'workspace-switch')).toBe(true)
    expect(matches({ ...press('[', { metaKey: true }), code: 'BracketLeft' }, 'workspace-switch')).toBe(false)
  })

  it('no longer takes Cmd+arrow, which is the system\'s to jump around text', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(matches(press(k, { metaKey: true }), 'workspace-switch'), k).toBe(false)
      expect(matches(press(k, { metaKey: true }), 'agent-switch'), k).toBe(false)
    }
  })

  it('needs the exact modifiers: no Mod, a stray Shift or Alt, or another key is not a match', () => {
    expect(matches(press('['), 'workspace-switch')).toBe(false)
    expect(matches(press('[', { metaKey: true }), 'workspace-switch')).toBe(false)
    expect(matches(press('[', { metaKey: true, shiftKey: true, altKey: true }), 'workspace-switch')).toBe(false)
    expect(matches(press('Tab', { ctrlKey: true, altKey: true }), 'agent-switch')).toBe(false)
    expect(matches(press('/', { metaKey: true }), 'shortcuts')).toBe(true)
  })
})

describe('the Changes tab', () => {
  it('has its own place in the sheet, with one shortcut to fold unchanged code', () => {
    expect(PLACES).toContain('Changes')
    expect(findShortcuts('', 'Changes', true).map((s) => s.id)).toEqual(['fold-unchanged'])
    expect(hint('fold-unchanged', true)).toBe('Fold or show unchanged code (⌘⌥U)')
    expect(hint('fold-unchanged', false)).toBe('Fold or show unchanged code (Ctrl+Alt+U)')
  })
})

describe('the table of shortcuts', () => {
  it('has a place, a description and keys for every entry, with no id twice', () => {
    for (const s of SHORTCUTS) {
      expect(PLACES).toContain(s.place)
      expect(s.text.trim()).not.toBe('')
      expect(s.keys.length).toBeGreaterThan(0)
    }
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length)
  })

  it('lists switching workspace and agent, and gives no key to two things', () => {
    expect(hint('workspace-switch', true)).toBe('Previous or next workspace (⇧⌘[ ⇧⌘])')
    expect(hint('workspace-switch', false)).toBe('Previous or next workspace (Shift+Ctrl+[ Shift+Ctrl+])')
    expect(hint('agent-switch', true)).toBe('Previous or next agent in this workspace (⇧⌃Tab ⌃Tab)')
    // The arrows with Cmd are the system's: nothing that works anywhere takes them, and only the terminal uses them, as a terminal does (line start and end, between commands).
    const arrows = (place: string) => SHORTCUTS.filter((s) => s.place === place).flatMap((s) => s.keys).filter((k) => /^Mod\+Arrow/.test(k))
    expect(arrows('Anywhere')).toEqual([])
    expect(arrows('Terminal')).toHaveLength(4)
  })

  it('words a hover hint as what it does and the key, for the platform', () => {
    expect(hint('terminals', true)).toBe('Show or hide the terminals (⌃`)')
    expect(hint('terminals', false)).toBe('Show or hide the terminals (Ctrl+`)')
    expect(hint('undo', true)).toBe('Undo (⌘Z)')
  })
})
