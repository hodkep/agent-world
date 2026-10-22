import type { RemoteRead } from '../ports'

// The program's own refusal, as printed at start: the line is shown to the person as the reason.
const REFUSED = /remote[ -]control[^\n]*\b(not available|unavailable|isn't available|disabled|not enabled|requires)\b/i

/**
 * A provider's `readRemote`: the link its program prints once remote control is on (matched by `link`), else the program's refusal, else nothing yet.
 * What differs between programs is only the link's address; the reading of a refusal is the same.
 */
export function remoteReader(link: RegExp): (screen: string) => RemoteRead {
  return (screen) => {
    const found = link.exec(screen)?.[0]
    if (found) return { link: found }
    const line = screen.split('\n').find((l) => REFUSED.test(l))
    return line ? { unavailable: line.trim() } : null
  }
}
