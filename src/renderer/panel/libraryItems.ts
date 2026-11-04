import type { LibraryItem } from '../../shared/library'

type List = () => Promise<{ items: LibraryItem[]; usage: unknown }>

/** How long the window keeps the list it got: it is asked for by every chat, and the main process reads every skill to answer. */
const FRESH_MS = 10_000

/**
 * One copy of the library's items for the whole window: everyone who asks within a few seconds gets the same answer (a request already on its way is shared),
 * and only an older answer, or `force`, asks the main process again. A failure is not kept.
 */
export function sharedLibraryItems(list: List, now: () => number = Date.now) {
  let at = -Infinity
  let have: Promise<Awaited<ReturnType<List>>> | null = null
  return (force = false) => {
    if (!force && have && now() - at < FRESH_MS) return have
    at = now()
    const p = list()
    have = p
    p.catch(() => {
      if (have === p) have = null
    })
    return p
  }
}

/** The window's own copy, asked for through the preload bridge. */
export const libraryItems = sharedLibraryItems(() => window.aw.library.list())
