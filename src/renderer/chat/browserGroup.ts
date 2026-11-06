import { isBrowserCommand, refNames } from './browserSteps'
import type { Row } from './format'

type Call = Extract<Row, { kind: 'tool' }>
/** A run of the agent's browser commands: the chat draws them as one card, a line per step. */
export interface BrowserGroup {
  kind: 'browser'
  /** The first call's id. */
  id: string
  calls: Call[]
  /** The controls named in the page snapshots the agent printed before this card: a message ends a card, not the page. */
  refs: Record<string, string>
}

const isBrowser = (r: Row): r is Call => r.kind === 'tool' && r.run.name === 'Bash' && isBrowserCommand(String(r.run.input.command ?? ''))

/**
 * Runs of browser commands become one group, a single command too. The agent's thinking between them is taken in (it is the pause between steps); thinking after the last
 * one stays where it was. A message, or any other command, ends the run.
 */
export function groupBrowser(rows: Row[]): (Row | BrowserGroup)[] {
  const out: (Row | BrowserGroup)[] = []
  let run: Call[] = []
  let held: Row[] = []
  let known: Record<string, string> = {}
  let runStart: Record<string, string> = {}
  const flush = () => {
    if (run.length) out.push({ kind: 'browser', id: run[0]!.id, calls: run, refs: runStart })
    out.push(...held)
    run = []
    held = []
  }
  for (const r of rows) {
    if (isBrowser(r)) {
      held = []
      if (!run.length) runStart = { ...known }
      run.push(r)
      if (r.run.result?.text) known = { ...known, ...refNames(r.run.result.text) }
    }
    else if (run.length && r.kind === 'thinking') held.push(r)
    else (flush(), out.push(r))
  }
  flush()
  return out
}
