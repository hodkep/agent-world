type Key = Pick<KeyboardEvent, 'type' | 'key' | 'metaKey' | 'altKey' | 'ctrlKey' | 'shiftKey'>

/**
 * What a Mac user means by Cmd/Option with the arrows and Backspace in a terminal, as the bytes a shell reads (what VS Code sends):
 * xterm.js alone sends them as modified-arrow codes that zsh and bash do not bind to anything.
 */
export function macKeySequence(e: Key): string | null {
  if (e.type !== 'keydown' || e.ctrlKey || e.shiftKey || e.metaKey === e.altKey) return null
  if (e.metaKey) return e.key === 'ArrowLeft' ? '\x01' : e.key === 'ArrowRight' ? '\x05' : e.key === 'Backspace' ? '\x15' : null
  return e.key === 'ArrowLeft' ? '\x1bb' : e.key === 'ArrowRight' ? '\x1bf' : e.key === 'Backspace' ? '\x1b\x7f' : null
}
