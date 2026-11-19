/** The viewer's look: the file as it was made (paper), or recoloured to the app (dark). Only the view changes, never the file. */
export type OfficeTheme = 'paper' | 'dark'

const KEY = 'aw.officeTheme'
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readTheme(store: Store = localStorage): OfficeTheme {
  try {
    return store.getItem(KEY) === 'dark' ? 'dark' : 'paper'
  } catch {
    return 'paper'
  }
}

export function saveTheme(theme: OfficeTheme, store: Store = localStorage): void {
  try {
    store.setItem(KEY, theme)
  } catch {
    // Storage can be blocked; the choice then lasts until the viewer closes.
  }
}
