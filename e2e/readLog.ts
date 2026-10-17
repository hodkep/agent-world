import { existsSync, readFileSync } from 'node:fs'

/**
 * What a fake program wrote to its log so far: nothing when it has not written yet. The first launch of an agent comes later on a slow machine than
 * the first look, and a read of a missing file in the middle of a poll ends the poll with an error instead of asking again.
 */
export const readLog = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
