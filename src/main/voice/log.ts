import { scrub } from './digest'
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'

/** A plain text log of what happens in talks (states, errors, why one ended; never the words or the audio), so one that goes wrong can be looked at. */
export function talkLog(file: string, now: () => number = Date.now, max = 200_000) {
  return (line: string) => {
    try {
      appendFileSync(file, `${new Date(now()).toISOString()} ${scrub(line)}\n`, { mode: 0o600 })
      if (statSync(file).size > max) {
        // The oldest half goes, from a line break on.
        const text = readFileSync(file, 'utf8')
        writeFileSync(file, text.slice(text.indexOf('\n', text.length - Math.floor(max / 2)) + 1), { mode: 0o600 })
      }
    } catch {
      /* a log that cannot be written is not worth stopping a talk for */
    }
  }
}
