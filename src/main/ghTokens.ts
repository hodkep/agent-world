/**
 * The GitHub token of each login a profile acts as, for the environment of an agent or terminal that starts.
 * `refresh` asks gh for them all (slowly, in the background at start-up); `get` gives one, and when it is not known asks once more at that moment
 * with the short lookup, so an agent that starts before the refresh ends, or after a miss, still gets its token. A signed-out login gets none.
 */
export function createGhTokens(ask: (login: string) => Promise<string | undefined>, askNow: (login: string) => string | undefined) {
  const tokens = new Map<string, string>()
  return {
    async refresh(logins: Iterable<string>) {
      for (const login of new Set(logins)) {
        const t = await ask(login)
        if (t) tokens.set(login, t)
        else tokens.delete(login)
      }
    },
    get(login: string): string | undefined {
      const known = tokens.get(login)
      if (known) return known
      const t = askNow(login)
      if (t) tokens.set(login, t)
      return t
    }
  }
}
