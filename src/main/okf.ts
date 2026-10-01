import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The product spec lives in a dot-folder at the root of the project: plain Markdown, `.okf/spec.md` first.
 * Agents are told where it is; the app itself never lists it, offers it for @-mentions or shows it in changes.
 */
export const OKF_DIR = '.okf'

export const isOkfPath = (path: string) => path === OKF_DIR || path.startsWith(`${OKF_DIR}/`)

/** The one line an agent is given about the spec, or nothing when the project has none. The file itself is read on demand, never loaded into context. */
export function okfHint(cwd: string): string {
  if (!existsSync(join(cwd, OKF_DIR))) return ''
  return `${OKF_DIR}/spec.md holds this project's product specification. Do not read it up front: open it only when the user asks about the product (what it does, who it is for, how it should behave) and use it to answer.`
}
