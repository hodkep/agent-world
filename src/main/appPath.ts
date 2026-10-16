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
