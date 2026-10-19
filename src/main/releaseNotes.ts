import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type ReleaseNotes, changelogSection } from '../shared/changelog'

/** The notes of the version that is installed, read from the CHANGELOG.md that came with the app (the first of these folders that has one). */
export function installedNotes(folders: string[], version: string): ReleaseNotes | null {
  for (const dir of folders) {
    try {
      return changelogSection(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), version)
    } catch {
      /* not here, or not a file: try the next place */
    }
  }
  return null
}
