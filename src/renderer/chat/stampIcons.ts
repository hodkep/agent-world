import type { HeaderIconName } from '../panel/IconButton'
import type { StampKind } from './officeCalls'

/** The picture on each kind of stamp: the header's own outline icons (an open book for the library, a clipboard for a todo, a document for a note, a flag, nodes for a plan or workflow). */
export const STAMP_ICON: Record<StampKind, HeaderIconName> = { library: 'library', todo: 'todo', note: 'file', flag: 'flag', plan: 'workflow' }
