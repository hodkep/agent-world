
export type FailureKind = 'network' | 'checksum' | 'size' | 'host' | 'cancelled' | 'manifest' | 'blocked' | 'install'

/** Where an in-app update of an unsigned Mac build stands, from the window's point of view. */
export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; received: number; total: number }
  | { phase: 'ready'; version: string; file: string }
  | { phase: 'installing'; version: string }
  | { phase: 'failed'; version?: string; kind: FailureKind; reason: string; /** The downloaded file, kept when the app cannot be replaced from where it is. */ file?: string }

/** A look for a newer version is not made while a download runs or waits for the restart: it would start the same download again. */
export const lookAllowed = (install: InstallState | undefined) => !install || !['downloading', 'ready', 'installing'].includes(install.phase)

/** Which kind of release a look, a download or an install is about. Stable is the latest release; beta the newest pre-release tagged -beta.N. */
export type UpdateChannel = 'stable' | 'beta'

/** What the last beta look found: the same fields as the stable state, kept apart so the top-bar chip and the three-hourly look stay stable only. */
/** How a release stands to the version installed: after it, before it, or the same. */
export type UpdateRel = 'newer' | 'same' | 'older'

export type BetaState = { rel?: UpdateRel; state: 'off' | 'checking' | 'none' | 'available' | 'error'; detail?: string; latest?: string; url?: string; notes?: string; tag?: string; /** When the release was published. */ date?: string; install?: InstallState }
