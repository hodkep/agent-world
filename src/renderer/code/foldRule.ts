/** The ways to show a diff's unchanged code: how many lines stay around each change when it is folded. */
export const CONTEXTS = [3, 5, 10] as const
export type Context = (typeof CONTEXTS)[number]
export interface Fold {
  fold: boolean
  context: Context
}
export const DEFAULT_FOLD: Fold = { fold: true, context: 3 }
export const FOLD_KEY = 'aw.changes.fold'
export const CONTEXT_KEY = 'aw.changes.context'

/** What was saved of the choice; anything missing, unreadable or not one of the offered values is the default. */
export function readFold(get: (key: string) => string | null): Fold {
  try {
    const fold = get(FOLD_KEY)
    const context = Number(get(CONTEXT_KEY))
    return { fold: fold === 'show' ? false : true, context: (CONTEXTS as readonly number[]).includes(context) ? (context as Context) : DEFAULT_FOLD.context }
  } catch {
    return DEFAULT_FOLD
  }
}

/** The diff editor's options for a choice. How many lines one click reveals and how short a stretch is worth a row stay at the editor's own values. */
export const foldOptions = (f: Fold) => ({ hideUnchangedRegions: { enabled: f.fold, contextLineCount: f.context } })
