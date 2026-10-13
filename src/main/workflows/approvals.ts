import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

interface Entry {
  id: string
  commands: string[]
  at: number
}

/**
 * Which versions of a workflow file the person approved the commands of. A version is its content hash, so an edit is a new version that
 * asks again. Kept in a small file the app owns; a damaged file or entry means "not approved", never a crash.
 */
export class Approvals {
  constructor(private file: string) {}

  private read(): Record<string, Entry> {
    try {
      const raw = (JSON.parse(readFileSync(this.file, 'utf8')) as { approved?: Record<string, unknown> }).approved ?? {}
      return Object.fromEntries(
        Object.entries(raw).filter((e): e is [string, Entry] => {
          const v = e[1] as Partial<Entry> | null
          return !!v && typeof v === 'object' && typeof v.id === 'string' && Array.isArray(v.commands) && typeof v.at === 'number'
        })
      )
    } catch {
      return {}
    }
  }

  has(hash: string): boolean {
    return hash in this.read()
  }

  approve(id: string, hash: string, commands: string[], at: number) {
    const approved = this.read()
    approved[hash] = { id, commands, at }
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify({ approved }, null, 2))
  }

  /** The version of this workflow approved most recently other than `hash`: what the current one is compared with. */
  previous(id: string, hash: string): { hash: string; commands: string[]; at: number } | undefined {
    const found = Object.entries(this.read())
      .filter(([h, e]) => e.id === id && h !== hash)
      .sort((a, b) => b[1].at - a[1].at)[0]
    return found && { hash: found[0], commands: found[1].commands, at: found[1].at }
  }
}
