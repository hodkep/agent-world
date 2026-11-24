/** Turns one file on or off in the set read as formatted text (a new set: the one given is not changed). */
export const toggled = (s: Set<string>, p: string): Set<string> => (s.has(p) ? new Set([...s].filter((x) => x !== p)) : new Set(s).add(p))
