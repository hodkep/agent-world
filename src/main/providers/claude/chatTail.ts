import { type FSWatcher, closeSync, openSync, readSync, statSync, watch } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import type { ChatItem } from '../../../shared/chat'
import { type LineNode, lineNode, parseTranscriptLine } from './chat'

const CHUNK = 1024 * 1024
/** How many messages the first read looks for, and the most it reads from the end of the file to find them. */
const WANT = 200
const BUDGET = 16 * CHUNK
const nextTurn = () => new Promise<void>((r) => setImmediate(r))

export interface TailOpts {
  /** The file is a subagent's own, whose lines are marked as a side chain and are the whole conversation. */
  subagent?: boolean
  /** Test knobs: the size of one read, the messages wanted, the bytes at most read, and what gives the loop a turn between reads. */
  chunk?: number
  want?: number
  budget?: number
  yieldLoop?: () => Promise<void>
}

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
  /** Where the first whole line we hold begins: everything before it in the file is not read yet. */
  private head = 0
  private loading = false
  private earlierBusy = false
  /** Settles when the first read is over (the file read from its end, a window of it at a time). */
  ready: Promise<void> = Promise.resolve()

  constructor(
    readonly file: string,
    /** `replace` means these items are the whole conversation now, not an addition to what was sent before. */
    private readonly onItems: (items: ChatItem[], replace: boolean) => void,
    private readonly opts: TailOpts = {}
  ) {}

  get hasEarlier() {
    return this.head > 0
  }

  /** The size of the file when the first read began. */
  bytes = 0

  /**
   * The file tells us when it changes, so nothing has to look at it every few hundred milliseconds for every agent, all day.
   * A slow check remains for what a watch can miss: a file that did not exist yet, or one that was swapped for another.
   */
  start(everyMs = 3000) {
    // The first read takes the newest part of the file, in turns of the event loop; nothing waits behind it.
    this.ready = this.load().then(() => this.poll())
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
    this.head = 0
  }

  poll() {
    if (this.loading) return // the first read is under way and will catch up with what was written meanwhile
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return // not written yet
    }
    // A shorter file means it was replaced (compaction can rewrite it): read it again, from its end if it is long.
    if (size < this.offset) {
      this.reset()
      if (size > (this.opts.chunk ?? CHUNK)) {
        this.ready = this.load().then(() => this.poll())
        return
      }
    }
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

  private parse(raw: string): Node | null {
    const info = lineNode(raw, this.opts)
    if (!info) return null
    return { ...info, items: parseTranscriptLine(raw, this.opts) }
  }

  /**
   * Reads whole lines backwards from `end` until enough messages are found or the byte budget is spent, a chunk at a time with a turn of the
   * event loop between chunks. Returns the nodes in file order and where the first of them begins.
   */
  private async readBack(fd: number, end: number): Promise<{ nodes: Node[]; head: number }> {
    const chunk = this.opts.chunk ?? CHUNK
    const want = this.opts.want ?? WANT
    const budget = this.opts.budget ?? BUDGET
    const turn = this.opts.yieldLoop ?? nextTurn
    const found: Node[] = []
    let carry: Buffer = Buffer.alloc(0)
    let head = end
    let count = 0
    let spent = 0
    while (end > 0 && count < want && spent < budget) {
      const start = Math.max(0, end - chunk)
      const buf = Buffer.alloc(end - start)
      const n = readSync(fd, buf, 0, buf.length, start)
      if (n < buf.length) break
      spent += buf.length
      const data = Buffer.concat([buf, carry])
      let from = 0
      if (start > 0) {
        // The first line may have begun in the chunk before: hold it until that chunk is read.
        const nl = data.indexOf(10)
        carry = nl < 0 ? data : data.subarray(0, nl + 1)
        from = nl < 0 ? data.length : nl + 1
      } else carry = Buffer.alloc(0)
      if (from < data.length) {
        const lines = data.subarray(from).toString('utf8').split('\n')
        lines.pop() // what follows the last newline is empty: `end` is always the start of a line
        for (let i = lines.length - 1; i >= 0; i--) {
          const node = this.parse(lines[i]!)
          if (!node) continue
          found.push(node)
          count += node.items.length
        }
        head = start + from
      }
      end = start
      await turn()
    }
    return { nodes: found.reverse(), head }
  }

  private take(nodes: Node[]) {
    for (const node of nodes) {
      if (node.parent) this.linked = true
      this.byId.set(node.uuid, node)
    }
  }

  /** The first read: the newest messages, from the end of the file. What is before them waits for `earlier`. */
  async load(): Promise<void> {
    let size: number
    try {
      size = statSync(this.file).size
    } catch {
      return // not written yet
    }
    if (size === 0) return
    this.bytes = size
    this.loading = true
    let fd = -1
    try {
      fd = openSync(this.file, 'r')
      // A line still being written is left for the poll that follows: the window ends at the last whole line.
      const last = Buffer.alloc(Math.min(this.opts.chunk ?? CHUNK, size))
      readSync(fd, last, 0, last.length, size - last.length)
      const nl = last.lastIndexOf(10)
      const end = nl >= 0 ? size - last.length + nl + 1 : 0
      this.reset()
      this.offset = end
      if (end === 0) return
      const { nodes, head } = await this.readBack(fd, end)
      this.nodes = nodes
      this.head = head
      this.take(nodes)
      this.emit()
    } catch {
      /* unreadable now: the next poll tries again */
    } finally {
      if (fd >= 0) closeSync(fd)
      this.loading = false
    }
  }

  /** Reads the part of the file before what is held. The items are those older than the ones shown, or the whole conversation when a rewind changed it. */
  async earlier(): Promise<{ items: ChatItem[]; replace: boolean }> {
    if (this.head === 0 || this.loading || this.earlierBusy) return { items: [], replace: false }
    this.earlierBusy = true
    let fd = -1
    try {
      fd = openSync(this.file, 'r')
      const { nodes, head } = await this.readBack(fd, this.head)
      this.nodes = [...nodes, ...this.nodes]
      this.head = head
      this.take(nodes)
      const now = this.active()
      const ids = now.map((i) => i.id)
      const keep = this.shown.length
      const grown = ids.length >= keep && this.shown.every((id, k) => id === ids[k + ids.length - keep])
      this.shown = ids
      return grown ? { items: now.slice(0, ids.length - keep), replace: false } : { items: now, replace: true }
    } catch {
      return { items: [], replace: false }
    } finally {
      if (fd >= 0) closeSync(fd)
      this.earlierBusy = false
    }
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
