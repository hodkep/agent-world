import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { ChatItem } from '../shared/chat'
import { parseTranscriptLine } from './chat'

const CHUNK = 1024 * 1024

/** Follows a session's transcript file and hands over chat items as lines are written to it. */
export class TranscriptTail {
  private offset = 0
  private rest = ''
  private decoder = new StringDecoder('utf8')
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    readonly file: string,
    private readonly onItems: (items: ChatItem[]) => void
  ) {}

  start(everyMs = 400) {
    this.poll()
    this.timer = setInterval(() => this.poll(), everyMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  poll() {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return // not written yet
    }
    // A shorter file means it was replaced (compaction can rewrite it): read it from the top.
    if (size < this.offset) (this.offset = 0), (this.rest = ''), (this.decoder = new StringDecoder('utf8'))
    if (size === this.offset) return
    const fd = openSync(this.file, 'r')
    try {
      while (this.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - this.offset))
        const n = readSync(fd, buf, 0, buf.length, this.offset)
        if (n <= 0) break
        this.offset += n
        this.rest += this.decoder.write(buf.subarray(0, n))
        const lines = this.rest.split('\n')
        // The last piece may be a line still being written.
        this.rest = lines.pop() ?? ''
        const items = lines.flatMap(parseTranscriptLine)
        if (items.length) this.onItems(items)
      }
    } finally {
      closeSync(fd)
    }
  }
}
