export const ADD_SELECTION_EVENT = 'aw-add-selection'

/**
 * The key for "add the selection to the message box". Each place that offers an Ask button listens and, when it has a
 * selection showing, does what its button does and marks the request handled; the first one to do so wins.
 * Returns whether any place took it, so the key is left alone when none did.
 */
export function requestAddSelection(on: EventTarget = window): boolean {
  const detail = { handled: false }
  on.dispatchEvent(new CustomEvent(ADD_SELECTION_EVENT, { detail }))
  return detail.handled
}
