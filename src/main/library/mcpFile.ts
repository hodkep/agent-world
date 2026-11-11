import { copyFileSync, existsSync, mkdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Writes a program's own file whole. A link is followed, so the link stays a link and the file it points at is the one changed (a dotfiles manager keeps these). The old text
 * is kept beside the file as .aw-bak, the new text is written to a temporary file and moved over it, and the file keeps its permissions; a new file is private.
 */
export function writeConfig(path: string, text: string): void {
  const file = existsSync(path) ? realpathSync(path) : path
  mkdirSync(dirname(file), { recursive: true })
  let mode = 0o600
  if (existsSync(file)) {
    mode = statSync(file).mode & 0o777
    copyFileSync(file, `${file}.aw-bak`)
  }
  const tmp = `${file}.aw-tmp`
  writeFileSync(tmp, text, { mode })
  renameSync(tmp, file)
}
