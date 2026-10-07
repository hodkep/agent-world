import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseDoc, renderDoc, slug, tokens } from './doc'

import type { LibraryItem, LibraryKind } from '../../shared/library'
export type Kind = LibraryKind
export type Item = LibraryItem

const FOLDER: Record<Exclude<Kind, 'skill'>, string> = { instruction: 'instructions', prompt: 'prompts' }
const SAFE = /^[a-z0-9][a-z0-9-]*$/

/** Everything the app keeps for agents to use: skills (folders), instructions and prompts (files), in one global folder. */
export class Library {
  constructor(readonly root: string) {}

  private skillDir = (id: string) => join(this.root, 'skills', id)
  private file = (kind: Exclude<Kind, 'skill'>, id: string) => join(this.root, FOLDER[kind], `${id}.md`)

  private skillFiles(dir: string): string[] {
    const out: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (relative(dir, p) !== 'SKILL.md') out.push(relative(dir, p))
      }
    }
    walk(dir)
    return out.sort()
  }

  private readSkill(id: string): Item | null {
    const dir = this.skillDir(id)
    let text: string
    try {
      text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
    } catch {
      return null
    }
    const d = parseDoc(text)
    const source = (() => {
      try {
        return readFileSync(join(dir, '.aw-source'), 'utf8').trim()
      } catch {
        return 'unknown'
      }
    })()
    return { id, kind: 'skill', name: d.name || id, description: d.description, body: d.body, source, files: this.skillFiles(dir), dir, tokens: { description: tokens(d.description), body: tokens(d.body) } }
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
        return readdirSync(join(this.root, sub), { withFileTypes: true }).filter((e) => (files ? e.isFile() && e.name.endsWith('.md') : e.isDirectory())).map((e) => (files ? e.name.slice(0, -3) : e.name))
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
      writeFileSync(join(this.skillDir(id), '.aw-source'), source)
    } else {
      mkdirSync(join(this.root, FOLDER[i.kind]), { recursive: true })
      writeFileSync(this.file(i.kind, id), renderDoc({ name: i.name, description: i.description, body: i.body, meta: { source } }))
    }
    return (await this.get(id))!
  }

  /** Copies a skill folder into the library (the original is left as it is); null when it is not a skill or is already here. */
  async addSkillFolder(src: string, source: string): Promise<Item | null> {
    let text: string
    try {
      text = readFileSync(join(src, 'SKILL.md'), 'utf8')
    } catch {
      return null
    }
    const name = parseDoc(text).name || src.split(/[\\/]/).pop()!
    const id = slug(name)
    if (!id || (await this.get(id))) return null
    const dest = this.skillDir(id)
    mkdirSync(dest, { recursive: true })
    // Links are not copied: one pointing outside the skill would let a read of it reach any file.
    cpSync(src, dest, { recursive: true, filter: (p) => (!p.split(/[\\/]/).pop()!.startsWith('.') || p === src) && !lstatSync(p).isSymbolicLink() })
    writeFileSync(join(dest, '.aw-source'), source)
    return this.get(id)
  }

  async remove(id: string): Promise<void> {
    if (!SAFE.test(id)) throw new Error(`Not a library item: ${id}`)
    const item = await this.get(id)
    if (!item) return
    if (item.kind === 'skill') rmSync(this.skillDir(id), { recursive: true, force: true })
    else rmSync(this.file(item.kind, id), { force: true })
  }

  has(id: string) {
    return SAFE.test(id) && (existsSync(this.skillDir(id)) || existsSync(this.file('instruction', id)) || existsSync(this.file('prompt', id)))
  }
}
