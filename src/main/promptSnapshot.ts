import { readFileSync, renameSync, writeFileSync } from 'node:fs'

/**
 * Claude saves the system prompt it started with in the session file and, on --resume, reuses it, ignoring a new
 * --append-system-prompt (checked against claude 2.1.287; --fork-session does the same). Removing those records
 * makes the next resume build the prompt from the launch flags; the conversation itself is untouched.
 * Returns how many were removed; a missing or unreadable file is left alone.
 */
export function dropPromptSnapshots(file: string): number {
  try {
    const lines = readFileSync(file, 'utf8').split('\n')
    const keep = lines.filter((l) => !l.includes('"prompt_snapshot"') || !isSnapshot(l))
    const dropped = lines.length - keep.length
    if (dropped) {
      writeFileSync(`${file}.tmp`, keep.join('\n'))
      renameSync(`${file}.tmp`, file)
    }
    return dropped
  } catch {
    return 0
  }
}

function isSnapshot(line: string): boolean {
  try {
    return (JSON.parse(line) as { attachment?: { type?: string } }).attachment?.type === 'prompt_snapshot'
  } catch {
    return false
  }
}
