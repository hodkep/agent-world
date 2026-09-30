import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { ChatItem } from '../shared/chat'
import { lineNode, parseTranscriptLine } from './chat'

const CHUNK = 1024 * 1024

interface Node {
  uuid: string
  parent: string | null
  message: boolean
  items: ChatItem[]
}

/**
 * Follows a session's transcript file. Claude links every line to the one before it, and a rewind starts a new
 * branch from an earlier line while the old lines stay in the file, so what is shown is the chain from the newest
 * message back to the start. A file whose lines carry no links is shown whole.
 */
export class TranscriptTail {
  private offset = 0
  private rest = ''
  private decoder = new StringDecoder('utf8')
  private timer: ReturnType<typeof setInterval> | null = null
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private shown: string[] = []
  private linked = false

  constructor(
    readonly file: string,
    /** `replace` means these items are the whole conversation now, not an addition to what was sent before. */
    private readonly onItems: (items: ChatItem[], replace: boolean) => void
  ) {}

  start(everyMs = 400) {
    this.poll()
    this.timer = setInterval(() => this.poll(), everyMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private reset() {
    this.offset = 0
    this.rest = ''
    this.decoder = new StringDecoder('utf8')
    this.nodes = []
    this.byId.clear()
    this.shown = []
    this.linked = false
  }

  poll() {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return // not written yet
    }
    // A shorter file means it was replaced (compaction can rewrite it): read it from the top.
    if (size < this.offset) this.reset()
    if (size === this.offset) return
    const fd = openSync(this.file, 'r')
    let changed = false
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
        for (const raw of lines) {
          const info = lineNode(raw)
          if (!info) continue
          if (info.parent) this.linked = true
          const node: Node = { ...info, items: parseTranscriptLine(raw) }
          this.nodes.push(node)
          this.byId.set(node.uuid, node)
          changed = true
        }
      }
    } finally {
      closeSync(fd)
    }
    if (changed) this.emit()
  }

  private active(): ChatItem[] {
    if (!this.linked) return this.nodes.flatMap((n) => n.items)
    const leaf = [...this.nodes].reverse().find((n) => n.message)
    const chain: Node[] = []
    for (let n = leaf, guard = 0; n && guard < 200_000; n = n.parent ? this.byId.get(n.parent) : undefined, guard++) chain.push(n)
    return chain.reverse().flatMap((n) => n.items)
  }

  private emit() {
    const now = this.active()
    const ids = now.map((i) => i.id)
    const same = this.shown.length <= ids.length && this.shown.every((id, k) => id === ids[k])
    if (same && this.shown.length > 0) {
      if (ids.length > this.shown.length) this.onItems(now.slice(this.shown.length), false)
    } else if (ids.length || this.shown.length) this.onItems(now, true)
    this.shown = ids
  }
}
