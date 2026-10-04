const nameOf = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1).replace(/^-/, '').toLowerCase()

/** A terminal is busy when something other than its shell is in front: a dev server, a build, an editor. */
export const isBusy = (shell: string, front: string | undefined) => !!front && nameOf(front) !== nameOf(shell)
