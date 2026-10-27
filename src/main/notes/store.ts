import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { noteTitle } from '../../shared/notePlan'

export interface NoteInfo {
  id: string
  title: string
  updatedAt: number
}

const ID = /^[a-f0-9]{8}$/
const KEY = /^[\w.-]+$/

/** The notes of each project as Markdown files, one folder per project and one file per note, so a note can be read, searched and kept in git by hand. */
export function createNoteStore(d: { dir: string; now?: () => number }) {
  const now = d.now ?? Date.now
  // The time a note was last written, kept here so a write is seen at once whatever the file system's clock does.
  const touched = new Map<string, number>()
  const folder = (key: string) => {
    if (!KEY.test(key) || key === '.' || key === '..') throw new Error('No project.')
    return join(d.dir, key)
  }
  const file = (key: string, id: string) => {
    if (!ID.test(id)) throw new Error('No note.')
    return join(folder(key), `${id}.md`)
  }
  const must = (key: string, id: string) => {
    const f = file(key, id)
    if (!existsSync(f)) throw new Error('No note.')
    return f
  }
  return {
    list(key: string): NoteInfo[] {
      const dir = folder(key)
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter((f) => ID.test(f.replace(/\.md$/, '')) && f.endsWith('.md'))
        .map((f) => {
          const id = f.slice(0, -3)
          return { id, title: noteTitle(readFileSync(join(dir, f), 'utf8')), updatedAt: touched.get(`${key}/${id}`) ?? statSync(join(dir, f)).mtimeMs }
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    read: (key: string, id: string): string => readFileSync(must(key, id), 'utf8'),
    write(key: string, id: string, text: string) {
      writeFileSync(must(key, id), text)
      touched.set(`${key}/${id}`, now())
    },
    create(key: string): string {
      mkdirSync(folder(key), { recursive: true })
      const id = randomBytes(4).toString('hex')
      writeFileSync(file(key, id), '')
      touched.set(`${key}/${id}`, now())
      return id
    },
    remove(key: string, id: string) {
      rmSync(must(key, id))
      touched.delete(`${key}/${id}`)
    }
  }
}

export type NoteStore = ReturnType<typeof createNoteStore>
