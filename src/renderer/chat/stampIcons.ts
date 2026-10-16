import type { StampKind } from './officeCalls'
import type { IconName } from './PixelIcon'

/** The picture on each kind of stamp: the icons the chat's own buttons use (a book for the library, a tick for a todo, a pencil for a note, a flag, a magnifier for a plan). */
export const STAMP_ICON: Record<StampKind, IconName> = { library: 'book', todo: 'check', note: 'pencil', flag: 'flag', plan: 'review' }
