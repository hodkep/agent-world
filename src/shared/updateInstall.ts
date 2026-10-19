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
