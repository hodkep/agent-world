import { type FSWatcher, closeSync, openSync, readSync, statSync, watch } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { ChatItem } from '../../../shared/chat'
import { type LineNode, lineNode, parseTranscriptLine } from './chat'

const CHUNK = 1024 * 1024

interface Node extends LineNode {
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
  private watcher: FSWatcher | null = null
  private catchUp: ReturnType<typeof setTimeout> | null = null
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private shown: string[] = []
  private linked = false

  constructor(
    readonly file: string,
    /** `replace` means these items are the whole conversation now, not an addition to what was sent before. */
    private readonly onItems: (items: ChatItem[], replace: boolean) => void,
    /** `subagent`: the file is a subagent's own, whose lines are marked as a side chain and are the whole conversation. */
    private readonly opts: { subagent?: boolean } = {}
  ) {}

  /**
   * The file tells us when it changes, so nothing has to look at it every few hundred milliseconds for every agent, all day.
   * A slow check remains for what a watch can miss: a file that did not exist yet, or one that was swapped for another.
   */
  start(everyMs = 3000) {
    this.poll()
    this.arm()
    this.timer = setInterval(() => {
      this.poll()
      if (!this.watcher) this.arm()
    }, everyMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.disarm()
  }

  private arm() {
    try {
      const w = watch(this.file, (event) => {
        this.poll()
        // A swapped file leaves the watch on the old one; watch the new one at the next chance.
        if (event === 'rename') this.disarm()
      })
      w.on('error', () => this.disarm())
      this.watcher = w
      // A watch takes a moment to become active: whatever was written in that moment is read now.
      if (this.catchUp) clearTimeout(this.catchUp)
      this.catchUp = setTimeout(() => this.poll(), 150)
    } catch {
      this.watcher = null // not written yet: the slow check tries again
    }
  }

  private disarm() {
    this.watcher?.close()
    this.watcher = null
    if (this.catchUp) clearTimeout(this.catchUp)
    this.catchUp = null
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
          const info = lineNode(raw, this.opts)
          if (!info) continue
          if (info.parent) this.linked = true
          const node: Node = { ...info, items: parseTranscriptLine(raw, this.opts) }
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
    chain.reverse()
    // The calls of one reply made side by side hang off each other and their results off their own call, so the
    // conversation carries on from only one of them. Keep the rest: same reply, or the result of a kept call.
    const keep = new Set(chain)
    const replies = new Set(chain.map((n) => n.reply).filter(Boolean))
    const calls = new Set(chain.flatMap((n) => n.uses))
    for (const n of this.nodes) {
      if (keep.has(n) || !n.message) continue
      if (n.reply && n.uses.length && replies.has(n.reply)) (keep.add(n), n.uses.forEach((u) => calls.add(u)))
    }
    for (const n of this.nodes) if (!keep.has(n) && n.message && n.results.length > 0 && n.results.every((r) => calls.has(r))) keep.add(n)
    return this.nodes.filter((n) => keep.has(n)).flatMap((n) => n.items)
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
