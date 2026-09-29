import xtermHeadless from '@xterm/headless'

const { Terminal } = xtermHeadless

/**
 * A headless copy of an agent's terminal. Claude's TUI redraws with cursor moves, so the raw byte
 * stream is not what the user sees; this is, and prompt detection reads from it.
 */
export class Screen {
  private readonly term: InstanceType<typeof Terminal>

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 0 })
  }

  write(data: string) {
    return new Promise<void>((resolve) => this.term.write(data, resolve))
  }

  resize(cols: number, rows: number) {
    this.term.resize(cols, rows)
  }

  /** The visible rows, as plain text. */
  text() {
    const b = this.term.buffer.active
    const rows: string[] = []
    for (let y = 0; y < this.term.rows; y++) rows.push(b.getLine(b.viewportY + y)?.translateToString(true) ?? '')
    return rows.join('\n')
  }

  dispose() {
    this.term.dispose()
  }
}
