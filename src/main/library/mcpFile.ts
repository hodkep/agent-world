import { randomBytes } from 'node:crypto'
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Writes a program's own file whole. The old text is kept beside the file as .aw-bak, the new text is written to a temporary file with a name nobody could have planted a link at
 * and moved over it, and the file keeps its permissions; a new file is private. A link is followed only when `followLink` says so (the person's own files, which a dotfiles
 * manager may link): a file that comes with a project may be a link to anywhere, so it is refused.
 */
export function writeConfig(path: string, text: string, o: { followLink?: boolean } = {}): void {
  let file = path
  try {
    if (lstatSync(path).isSymbolicLink()) {
      if (!o.followLink) throw new Error('That file is a link, so nothing was written. Change the file it points at.')
      file = realpathSync(path)
    }
  } catch (e) {
    if (e instanceof Error && /is a link/.test(e.message)) throw e
    /* not there yet: it is made below */
  }
  mkdirSync(dirname(file), { recursive: true })
  let mode = 0o600
  if (existsSync(file)) {
    mode = statSync(file).mode & 0o777
    // Whatever is at the backup's name goes first, so a link left there is not written through; the copy then fails rather than overwrite.
    const bak = `${file}.aw-bak`
    rmSync(bak, { force: true })
    copyFileSync(file, bak, constants.COPYFILE_EXCL)
  }
  const tmp = `${file}.${randomBytes(6).toString('hex')}.aw-tmp`
  try {
    writeFileSync(tmp, text, { mode, flag: 'wx' })
    renameSync(tmp, file)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      /* nothing was made */
    }
    throw e
  }
}
