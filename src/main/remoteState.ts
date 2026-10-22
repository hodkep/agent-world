import type { RemoteState } from '../shared/types'
import type { RemoteRead } from './providers/ports'

/** The state of an agent's remote control from what it was asked for and what its screen shows. */
export function remoteState(asked: boolean | undefined, read: RemoteRead): RemoteState {
  if (!asked) return { state: 'off' }
  if (!read) return { state: 'starting' }
  return 'link' in read ? { state: 'on', link: read.link } : { state: 'unavailable', reason: read.unavailable }
}
