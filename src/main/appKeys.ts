import { matches, SHORTCUTS, tabNumber } from '../renderer/shortcuts'

/** A key press as Electron reports it for a web page. */
export interface KeyInput {
  type: string
  key: string
  code: string
  meta: boolean
  control: boolean
  alt: boolean
  shift: boolean
}

/** The shortcuts that belong to the app wherever the keyboard is pointing: with a page in Preview (or the Code panel) clicked, the page is a window of its own and would swallow them. */
const OWNED = ['office', 'sleep-wake', 'latest', 'full-screen', 'palette', 'shortcuts']

/**
 * Whether a key press over a web page is one of the app's own: the side panel tabs (Mod+Alt+1-9), the other Mod+Alt shortcuts, the palette and the shortcuts sheet.
 * Read from the one shortcuts list, so a new shortcut is added there and here by naming it. Everything else (copy, find, Esc, plain keys) stays the page's.
 */
export function appKey(input: KeyInput): boolean {
  if (input.type !== 'keyDown') return false
  const e = { key: input.key, code: input.code, metaKey: input.meta, ctrlKey: input.control, altKey: input.alt, shiftKey: input.shift }
  return tabNumber(e) !== null || OWNED.some((id) => SHORTCUTS.some((s) => s.id === id) && matches(e, id))
}

/** The press as the app's window gets it, to be made a keyboard event there. */
export const forwarded = (input: KeyInput) => ({ key: input.key, code: input.code, metaKey: input.meta, ctrlKey: input.control, altKey: input.alt, shiftKey: input.shift })
