const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'shell-session', 'terminal'])

/**
 * The command a code block in a reply stands for, when it can be run in the terminal: a shell block, or a single line with no
 * language. The prompt it is written with ("! " for Claude's shell mode, "$ " for a shell) is not part of the command. Null for
 * anything else (code in other languages, diagrams, several lines of no stated language).
 */
export function runnable(lang: string, text: string): string | null {
  const lines = text.replace(/\s+$/, '').split('\n')
  const language = lang.toLowerCase()
  if (!(SHELLS.has(language) || (language === '' && lines.length === 1))) return null
  const command = lines.map((l) => l.replace(/^\s*(!|\$)\s+/, '')).join('\n').trim()
  return command ? command : null
}

/** Sent on the window when a command is to be run in the project's terminal; the terminal drawer answers it. */
export const RUN_EVENT = 'aw-run-in-terminal'
