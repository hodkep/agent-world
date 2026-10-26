const MAC: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' }
const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }

export const PLACES = ['Anywhere', 'Conversation', 'Message box', 'Terminal', 'Changes', 'Image editor'] as const
export type Place = (typeof PLACES)[number]

/** One thing the keyboard does. `keys` are written as "Shift+Mod+Z"; two of them are two ways, or two directions, of the one thing. */
export interface Shortcut {
  id: string
  place: Place
  text: string
  keys: string[]
  /** The handler needs the Cmd key itself, so it does nothing on a keyboard without one. */
  mac?: boolean
}

/** The one list the shortcuts sheet and the hover hints read, so they cannot say different things. Keep it in step with the key handlers. */
export const SHORTCUTS: Shortcut[] = [
  { id: 'palette', place: 'Anywhere', text: 'Command palette for the selected agent', keys: ['Mod+K'] },
  { id: 'terminals', place: 'Anywhere', text: 'Show or hide the terminals', keys: ['Ctrl+`'] },
  { id: 'shortcuts', place: 'Anywhere', text: 'Show these shortcuts', keys: ['Mod+/'] },
  { id: 'workspace-switch', place: 'Anywhere', text: 'Previous or next workspace', keys: ['Shift+Mod+[', 'Shift+Mod+]'] },
  { id: 'agent-switch', place: 'Anywhere', text: 'Previous or next agent in this workspace', keys: ['Shift+Ctrl+Tab', 'Ctrl+Tab'] },
  { id: 'tab-jump', place: 'Anywhere', text: 'Go to the first, second … tab of the side panel', keys: ['Mod+Alt+1-9'] },
  { id: 'add-selection', place: 'Anywhere', text: 'Add the selected words, code or output to the message box as context', keys: ['Shift+Mod+L'] },
  { id: 'close', place: 'Anywhere', text: 'Close a dialog, menu or card', keys: ['Esc'] },
  { id: 'resize-panel', place: 'Anywhere', text: 'Resize the side panel (on its edge)', keys: ['ArrowLeft', 'ArrowRight'] },

  { id: 'chat-find', place: 'Conversation', text: 'Find in the conversation', keys: ['Mod+F'] },
  { id: 'find-step', place: 'Conversation', text: 'Older or newer match', keys: ['Enter', 'Shift+Enter'] },
  { id: 'jump-messages', place: 'Conversation', text: 'Jump between your messages', keys: ['Alt+ArrowUp', 'Alt+ArrowDown'] },
  { id: 'latest', place: 'Conversation', text: 'Jump to the latest message', keys: ['Mod+Alt+ArrowDown'] },
  { id: 'stop', place: 'Conversation', text: 'Stop the agent while it works', keys: ['Esc'] },

  { id: 'send', place: 'Message box', text: 'Send', keys: ['Enter'] },
  { id: 'newline', place: 'Message box', text: 'New line', keys: ['Shift+Enter'] },
  { id: 'cycle-mode', place: 'Message box', text: 'Next permission mode', keys: ['Shift+Tab'] },
  { id: 'history', place: 'Message box', text: 'Earlier or later sent message', keys: ['ArrowUp', 'ArrowDown'] },
  { id: 'search-sent', place: 'Message box', text: 'Search sent messages', keys: ['Ctrl+R'] },
  { id: 'accept', place: 'Message box', text: 'Accept a /command or @mention', keys: ['Tab'] },
  { id: 'undo-typing', place: 'Message box', text: 'Undo or redo typing', keys: ['Mod+Z', 'Shift+Mod+Z'] },

  { id: 'term-find', place: 'Terminal', text: 'Find in the terminal output', keys: ['Mod+F'], mac: true },
  { id: 'term-clear', place: 'Terminal', text: 'Clear the terminal', keys: ['Mod+K'], mac: true },
  { id: 'term-open', place: 'Terminal', text: 'Open a link or file path', keys: ['Mod+click'] },
  { id: 'term-word', place: 'Terminal', text: 'Move by word', keys: ['Alt+ArrowLeft', 'Alt+ArrowRight'], mac: true },
  { id: 'term-jump', place: 'Terminal', text: 'Jump between commands', keys: ['Mod+ArrowUp', 'Mod+ArrowDown'], mac: true },
  { id: 'term-line', place: 'Terminal', text: 'Move to the start or end of the line', keys: ['Mod+ArrowLeft', 'Mod+ArrowRight'], mac: true },
  { id: 'term-del-word', place: 'Terminal', text: 'Delete a word', keys: ['Alt+Backspace'], mac: true },
  { id: 'term-del-line', place: 'Terminal', text: 'Delete the line', keys: ['Mod+Backspace'], mac: true },

  { id: 'fold-unchanged', place: 'Changes', text: 'Fold or show unchanged code', keys: ['Mod+Alt+U'] },

  { id: 'undo', place: 'Image editor', text: 'Undo', keys: ['Mod+Z'] },
  { id: 'redo', place: 'Image editor', text: 'Redo', keys: ['Shift+Mod+Z'] },
  { id: 'editor-close', place: 'Image editor', text: 'Close the editor', keys: ['Esc'] }
]

/** A combination as the person's keyboard names it: "Shift+Mod+Z" is ⇧⌘Z on a Mac and Shift+Ctrl+Z elsewhere. */
export function showKey(combo: string, mac: boolean): string {
  const parts = combo.split('+').map((k) => ARROWS[k] ?? (mac ? (MAC[k] ?? k) : k === 'Mod' ? 'Ctrl' : k))
  return parts.join(mac ? '' : '+')
}

type KeyPress = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'> & Partial<Pick<KeyboardEvent, 'code'>>

// A bracket is read from the key itself where the press says which one it was: with Shift the character is { or } on a US keyboard.
const CODE: Record<string, string> = { '[': 'BracketLeft', ']': 'BracketRight' }

/** Whether a key press is one of the keys of this shortcut, so a handler reads the same table the sheet shows. Mod is Cmd or Ctrl (Ctrl alone is the Ctrl key); Shift and Alt must match exactly. */
export function matches(e: KeyPress, id: string): boolean {
  const s = SHORTCUTS.find((x) => x.id === id)
  if (!s) throw new Error(`No shortcut ${id}`)
  return s.keys.some((combo) => {
    const parts = combo.split('+')
    const key = parts[parts.length - 1]!
    // With Shift held a letter arrives as a capital, and with Caps Lock as the other case: a letter is compared without case.
    const same = e.code && CODE[key] ? e.code === CODE[key] : key.length === 1 && /[a-z]/i.test(key) ? e.key.toLowerCase() === key.toLowerCase() : e.key === key
    // Ctrl alone means the Ctrl key even on a Mac (where Mod is Cmd); Mod is Cmd or Ctrl.
    const mod = parts.includes('Ctrl') ? e.ctrlKey && !e.metaKey : (e.metaKey || e.ctrlKey) === parts.includes('Mod')
    return same && mod && e.shiftKey === parts.includes('Shift') && e.altKey === parts.includes('Alt')
  })
}

/** Which tab Mod+Alt+digit asks for (1 is the first), or null for any other press. Read from the key, not the character: Option+1 types ¡ on a Mac. */
export function tabNumber(e: KeyPress): number | null {
  const d = /^Digit([1-9])$/.exec(e.code ?? '')?.[1]
  return d && (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey ? Number(d) : null
}

export const isMac =() => /mac/i.test(navigator.platform)

/** All the keys of one shortcut, as shown: "↑ ↓" for an either-or pair. */
export const showKeys = (s: Shortcut, mac: boolean) => s.keys.map((k) => showKey(k, mac)).join(' ')

/** The shortcuts that work on this keyboard, narrowed to one place and to those whose words or keys contain what was typed. */
export function findShortcuts(query: string, place: Place | null, mac = isMac()): Shortcut[] {
  const q = query.trim().toLowerCase()
  return SHORTCUTS.filter((s) => (mac || !s.mac) && (!place || s.place === place) && (!q || `${s.text} ${showKeys(s, mac)}`.toLowerCase().includes(q)))
}

/** Just the keys of one shortcut, for a hover hint that has its own words. Throws on an id that is not in the list, so a typo shows up at once. */
export function keysOf(id: string, mac = isMac()): string {
  const s = SHORTCUTS.find((x) => x.id === id)
  if (!s) throw new Error(`No shortcut ${id}`)
  return showKeys(s, mac)
}

/** What a button's hover hint says: what the key does and the key. Throws on an id that is not in the list, so a typo shows up at once. */
export function hint(id: string, mac = isMac()): string {
  return `${SHORTCUTS.find((x) => x.id === id)?.text ?? keysOf(id, mac)} (${keysOf(id, mac)})`
}
