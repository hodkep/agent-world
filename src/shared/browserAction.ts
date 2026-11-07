/**
 * What an agent's browser tool is doing, as the frame's tab says it: a short label for the pill and, where it helps, the thing it is done to.
 * Shared: the main process makes these from the commands, the screen draws them.
 */
export interface Action {
  pill: string
  target?: string
  /** The tool asked for something that is not allowed: the tab says so. */
  refused?: boolean
  /** A command the tools also use for small chores (a script to click and type): it never replaces a more specific label that was just shown. */
  low?: boolean
}

export const screenKind = (w: number) => (w < 600 ? 'phone' : w < 1024 ? 'tablet' : 'desktop')

/** The same thing as a sentence, for the tab's tip and its spoken name. */
export function sentence(a: Action): string {
  const t = a.target
  switch (a.pill) {
    case 'OPENING':
      return `opening ${t ?? 'a page'}`
    case 'RELOADING':
      return 'reloading the page'
    case 'GOING BACK':
      return 'going back'
    case 'CLICKING':
      return t ? `clicking ${t}` : 'clicking'
    case 'DOUBLE-CLICK':
      return t ? `double-clicking ${t}` : 'double-clicking'
    case 'RIGHT-CLICK':
      return t ? `right-clicking ${t}` : 'right-clicking'
    case 'SCROLLING':
      return t ? `scrolling ${t}` : 'scrolling'
    case 'TYPING':
      return t ? `typing in ${t}` : 'typing'
    case 'PRESSING':
      return `pressing ${t ?? 'a key'}`
    case 'RESIZING':
      return t?.startsWith('back') ? `resizing ${t}` : `resizing to ${t ?? 'a new size'}`
    case 'SCREENSHOT':
      return `taking a screenshot of ${t ?? 'the page'}`
    case 'READING':
      return `reading ${t ?? 'the page'}`
    case 'SCRIPT':
      return 'running a script'
    case 'DRAGGING':
      return 'dragging'
    case 'DROP FILE':
      return `trying to drop a file${t ? `: ${t}` : ''}`
    case 'UPLOAD FILE':
      return `trying to upload a file${t ? `: ${t}` : ''}`
    default:
      return a.pill.toLowerCase()
  }
}
