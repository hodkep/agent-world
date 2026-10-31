const MARK = /__AW__(.*)__AW__/s

/** The PATH a login shell printed between the markers: its startup files may print anything else around it. */
export function parseLoginPath(out: string): string | undefined {
  return MARK.exec(out)?.[1] || undefined
}

/**
 * The PATH of an installed app. A Mac app started from Finder gets only /usr/bin:/bin:/usr/sbin:/sbin, and Claude Code installs into ~/.local/bin,
 * so the login shell's path comes first and the usual install folders (Claude, Antigravity, Homebrew on Apple silicon and Intel) after it.
 */
export function packagedPath(loginPath: string | undefined, home: string): string {
  return [loginPath, `${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':')
}

/**
 * A reader of the login shell's path that never makes a caller wait for a shell. Starting an interactive login shell reads the person's startup files and
 * takes one to three seconds, and the main process cannot answer anything meanwhile (typing and scrolling stop). The first call has to read it; after that
 * the answer comes from memory, and once it is old a fresh one is read in the background, so a newly installed program is still found without a restart.
 */
export function cachedLoginPath(o: { readSync: () => string | undefined; readAsync: () => Promise<string | undefined>; now?: () => number; ttlMs?: number }): () => string | undefined {
  const now = o.now ?? Date.now
  const ttl = o.ttlMs ?? 5 * 60_000
  let value: string | undefined
  let loaded = false
  let at = 0
  let refreshing = false
  return () => {
    if (!loaded) {
      value = o.readSync()
      loaded = true
      at = now()
    } else if (!refreshing && now() - at > ttl) {
      refreshing = true
      void o.readAsync().then(
        (v) => {
          if (v) value = v
        },
        () => undefined
      ).finally(() => {
        at = now()
        refreshing = false
      })
    }
    return value
  }
}
