import { existsSync } from 'node:fs'
import { win32 } from 'node:path'

export interface Launch {
  file: string
  /** Arguments that must come before the caller's own (cmd.exe /c for a .cmd wrapper). */
  prefix: string[]
}

/**
 * How to start `bin` where the operating system will not find it by name alone. Windows programs need their extension
 * and a .cmd wrapper (how npm installs claude) has to be run through cmd.exe; elsewhere the name is used as given.
 */
export function resolveCommand(bin: string, o: { platform?: NodeJS.Platform; path?: string; pathExt?: string; exists?: (p: string) => boolean } = {}): Launch {
  const platform = o.platform ?? process.platform
  if (platform !== 'win32') return { file: bin, prefix: [] }
  const exists = o.exists ?? existsSync
  const exts = (o.pathExt ?? process.env.PATHEXT ?? '.EXE;.CMD').split(';').filter(Boolean)
  const hasExt = /\.[a-z]{2,4}$/i.test(bin)
  const dirs = win32.isAbsolute(bin) || /[\\/]/.test(bin) ? [''] : (o.path ?? process.env.PATH ?? '').split(';').filter(Boolean)
  for (const dir of dirs) {
    const base = dir ? win32.join(dir, bin) : bin
    for (const ext of hasExt ? [''] : exts) {
      const file = base + ext
      if (!exists(file)) continue
      return /\.(cmd|bat)$/i.test(file) ? { file: 'cmd.exe', prefix: ['/c', file] } : { file, prefix: [] }
    }
  }
  return { file: bin, prefix: [] }
}
