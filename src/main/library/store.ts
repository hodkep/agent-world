import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseDoc, renderDoc, slug, tokens } from './doc'

import type { LibraryItem, LibraryKind, SkillPlace } from '../../shared/library'
export type Kind = LibraryKind
export type Item = LibraryItem

const FOLDER: Record<Exclude<Kind, 'skill'>, string> = { instruction: 'instructions', prompt: 'prompts' }
const SAFE = /^[a-z0-9][a-z0-9-]*$/

/** Whether two files hold the same bytes (compared a block at a time, as a skill's files can be large). */
function sameFile(a: string, b: string): boolean {
  if (statSync(a).size !== statSync(b).size) return false
  const x = openSync(a, 'r')
  const y = openSync(b, 'r')
  try {
    const bx = Buffer.alloc(1 << 20)
    const by = Buffer.alloc(1 << 20)
    for (;;) {
      const n = readSync(x, bx, 0, bx.length, null)
      if (readSync(y, by, 0, n, null) !== n || !bx.subarray(0, n).equals(by.subarray(0, n))) return false
      if (n === 0) return true
    }
  } finally {
    closeSync(x)
    closeSync(y)
  }
}

/** Folders a program installs into a skill (dependencies, caches): not files an agent reads, and often tens of thousands of them. */
const INSTALLED = new Set(['node_modules', '__pycache__', 'venv', 'site-packages'])
/** The most files listed for one skill. */
const MAX_FILES = 500
/** How long a skill's file list and token counts are kept. */
const DETAIL_TTL_MS = 30_000

/** What reading each of a skill's other files costs: text files under 100 KB only (others are left out). */
function fileTokens(dir: string, files: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of files) {
    try {
      const p = join(dir, f)
      if (statSync(p).size > 100 * 1024) continue
      const text = readFileSync(p, 'utf8')
      if (!text.includes('\u0000')) out[f] = tokens(text)
    } catch {
      /* unreadable: no size */
    }
  }
  return out
}

/** Everything the app keeps for agents to use: skills (folders), instructions and prompts (files), in one global folder. */
export class Library {
  constructor(
    readonly root: string,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * A skill's files and what reading each costs, kept for half a minute. The list of skills is asked for many times a minute (each chat, each agent that uses a skill,
   * each prompt): without this every call read every text file of every skill.
   */
  private detail = new Map<string, { at: number; stamp: string; files: string[]; tokens: Record<string, number> }>()

  private skillDir = (id: string) => join(this.root, 'skills', id)

  /** Where each linked skill's real folder is and where it came from, kept here and never inside the folder or its project. */
  records(): Record<string, SkillPlace> {
    try {
      return JSON.parse(readFileSync(join(this.root, 'records.json'), 'utf8')) as Record<string, SkillPlace>
    } catch {
      return {}
    }
  }

  private setRecord(id: string, place: SkillPlace | null) {
    const all = this.records()
    if (place) all[id] = place
    else delete all[id]
    mkdirSync(this.root, { recursive: true })
    writeFileSync(join(this.root, 'records.json'), JSON.stringify(all, null, 1))
  }
  private file = (kind: Exclude<Kind, 'skill'>, id: string) => join(this.root, FOLDER[kind], `${id}.md`)

  /** The skill's files, the ones nearest its folder first, so the most files listed (MAX_FILES) cuts the deepest ones. */
  private skillFiles(dir: string): string[] {
    const out: string[] = []
    const queue = [dir]
    for (let d = queue.shift(); d !== undefined && out.length < MAX_FILES; d = queue.shift()) {
      let entries
      try {
        entries = readdirSync(d, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries.sort((x, y) => (x.name < y.name ? -1 : 1))) {
        if (e.name.startsWith('.') || e.isSymbolicLink() || (e.isDirectory() && INSTALLED.has(e.name))) continue
        const p = join(d, e.name)
        if (e.isDirectory()) queue.push(p)
        else if (relative(dir, p) !== 'SKILL.md' && out.length < MAX_FILES) out.push(relative(dir, p))
      }
    }
    return out.sort()
  }

  /** The skill's files and their token counts, from the cache while it is fresh and the skill's SKILL.md and folder have not changed. */
  private filesOf(dir: string, id: string): { files: string[]; tokens: Record<string, number> } {
    const stamp = (() => {
      try {
        return `${statSync(join(dir, 'SKILL.md')).mtimeMs}:${statSync(dir).mtimeMs}`
      } catch {
        return ''
      }
    })()
    const have = this.detail.get(id)
    if (have && have.stamp === stamp && this.now() - have.at < DETAIL_TTL_MS) return have
    const files = this.skillFiles(dir)
    const fresh = { at: this.now(), stamp, files, tokens: fileTokens(dir, files) }
    this.detail.set(id, fresh)
    return fresh
  }

  private readSkill(id: string): Item | null {
    const dir = this.skillDir(id)
    const place = this.records()[id]
    let text: string
    try {
      text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    } catch {
      // A link whose folder is gone stays listed so it can be removed; anything else that is not a skill is not one.
      return place ? { id, kind: 'skill', name: id, description: '', body: '', source: place.from ?? place.label ?? place.real, files: [], dir, tokens: { description: 0, body: 0 }, place, missing: true } : null
    }
    const d = parseDoc(text)
    const source = place ? (place.from ?? place.label ?? place.real) : (() => {
      try {
        return readFileSync(join(dir, '.aw-source'), 'utf8').trim()
      } catch {
        return 'unknown'
      }
    })()
    const { files, tokens: fileSizes } = this.filesOf(dir, id)
    return { id, kind: 'skill', name: d.name || id, description: d.description, body: d.body, source, files, fileTokens: fileSizes, dir, tokens: { description: tokens(d.description), body: tokens(d.body) }, ...(place && { place }) }
  }

  private readFile(kind: Exclude<Kind, 'skill'>, id: string): Item | null {
    let text: string
    try {
      text = readFileSync(this.file(kind, id), 'utf8')
    } catch {
      return null
    }
    const d = parseDoc(text)
    return { id, kind, name: d.name || id, description: d.description, body: d.body, source: d.meta.source ?? 'new', files: [], dir: '', tokens: { description: tokens(d.description), body: tokens(d.body) } }
  }

  async get(id: string): Promise<Item | null> {
    if (!SAFE.test(id)) return null
    return this.readSkill(id) ?? this.readFile('instruction', id) ?? this.readFile('prompt', id)
  }

  async list(): Promise<Item[]> {
    return this.listSync()
  }

  /** The same, without waiting: an agent is started synchronously and needs its library text at once. */
  listSync(): Item[] {
    const names = (sub: string, files: boolean) => {
      try {
        // A skill that is a link to its folder counts as a folder.
        return readdirSync(join(this.root, sub), { withFileTypes: true }).filter((e) => (files ? e.isFile() && e.name.endsWith('.md') : e.isDirectory() || e.isSymbolicLink())).map((e) => (files ? e.name.slice(0, -3) : e.name))
      } catch {
        return []
      }
    }
    const items: Item[] = [
      ...names('skills', false).map((n) => this.readSkill(n)),
      ...names(FOLDER.instruction, true).map((n) => this.readFile('instruction', n)),
      ...names(FOLDER.prompt, true).map((n) => this.readFile('prompt', n))
    ].filter((i): i is Item => i !== null)
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** A free id for a name: the name itself, or with a number when something else already has it. */
  private async freeId(name: string): Promise<string> {
    const base = slug(name) || 'item'
    for (let n = 1; ; n++) {
      const id = n === 1 ? base : `${base}-${n}`
      if (!(await this.get(id))) return id
    }
  }

  /** Writes an instruction or a prompt (a new one when there is no id), and a skill's SKILL.md; returns what is stored. */
  async save(i: { id?: string; kind: Kind; name: string; description: string; body: string; source?: string }): Promise<Item> {
    const id = i.id && SAFE.test(i.id) ? i.id : await this.freeId(i.name)
    const existing = i.id ? await this.get(id) : null
    const source = i.source ?? existing?.source ?? 'new'
    if (i.kind === 'skill') {
      mkdirSync(this.skillDir(id), { recursive: true })
      writeFileSync(join(this.skillDir(id), 'SKILL.md'), renderDoc({ name: i.name, description: i.description, body: i.body }))
      // A linked skill is the person's own folder: nothing of ours is written into it.
      if (!this.records()[id]) writeFileSync(join(this.skillDir(id), '.aw-source'), source)
    } else {
      mkdirSync(join(this.root, FOLDER[i.kind]), { recursive: true })
      writeFileSync(this.file(i.kind, id), renderDoc({ name: i.name, description: i.description, body: i.body, meta: { source } }))
    }
    return (await this.get(id))!
  }

  /** Adds a skill folder as a link: the files stay where they are and nothing is copied or written into them. Null when it is not a skill or its name is taken. */
  async addSkillFolder(src: string, source: string, place: Partial<SkillPlace> = {}): Promise<Item | null> {
    let text: string
    try {
      text = readFileSync(join(src, 'SKILL.md'), 'utf8')
    } catch {
      return null
    }
    const name = parseDoc(text).name || src.split(/[\\/]/).pop()!
    const id = slug(name)
    if (!id || (await this.get(id))) return null
    const real = realpathSync(src)
    mkdirSync(join(this.root, 'skills'), { recursive: true })
    symlinkSync(real, this.skillDir(id), 'dir')
    this.setRecord(id, { kind: 'global', ...place, real, label: source })
    return this.get(id)
  }

  /**
   * Swaps a skill the library holds as a copy for a link to the original, freeing the copy. Only when every file of the copy (hidden ones aside, which a copy never had)
   * is in the original with the same size: the original is then the same skill and more, and nothing the copy had is lost.
   */
  async useOriginal(id: string, src: string, place: Partial<SkillPlace>): Promise<Item> {
    if (!SAFE.test(id)) throw new Error(`Not a library item: ${id}`)
    const copy = this.skillDir(id)
    if (this.records()[id] || lstatSync(copy, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`${id} is already a link.`)
    const real = realpathSync(src)
    const missing = this.skillFiles(copy).concat('SKILL.md').filter((f) => {
      try {
        return !sameFile(join(copy, f), join(real, f))
      } catch {
        return true
      }
    })
    if (missing.length) throw new Error(`${missing[0]} is not in the original (or differs), so the copy is kept.`)
    rmSync(copy, { recursive: true, force: true })
    symlinkSync(real, copy, 'dir')
    this.setRecord(id, { kind: 'global', ...place, real, label: place.label ?? 'original' })
    return (await this.get(id))!
  }

  async remove(id: string): Promise<void> {
    if (!SAFE.test(id)) throw new Error(`Not a library item: ${id}`)
    const item = await this.get(id)
    if (!item) return
    if (item.kind === 'skill') {
      // A linked skill is only unlinked: its folder is the person's own and stays.
      if (lstatSync(this.skillDir(id), { throwIfNoEntry: false })?.isSymbolicLink()) unlinkSync(this.skillDir(id))
      else rmSync(this.skillDir(id), { recursive: true, force: true })
      this.setRecord(id, null)
    } else rmSync(this.file(item.kind, id), { force: true })
  }

  /** The skills switched off for Claude. Every skill is on until it is listed here. */
  claudeOff(): Set<string> {
    try {
      return new Set((JSON.parse(readFileSync(join(this.root, 'claude-off.json'), 'utf8')) as string[]).filter((id) => SAFE.test(id)))
    } catch {
      return new Set()
    }
  }

  setClaude(id: string, on: boolean): void {
    if (!SAFE.test(id)) throw new Error(`Not a library item: ${id}`)
    const off = this.claudeOff()
    if (on) off.delete(id)
    else off.add(id)
    mkdirSync(this.root, { recursive: true })
    writeFileSync(join(this.root, 'claude-off.json'), JSON.stringify([...off].sort()))
  }

  has(id: string) {
    return SAFE.test(id) && (lstatSync(this.skillDir(id), { throwIfNoEntry: false }) !== undefined || existsSync(this.file('instruction', id)) || existsSync(this.file('prompt', id)))
  }
}
