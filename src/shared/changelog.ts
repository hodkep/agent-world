/** The notes of one released version: the changelog's text under its `## [x.y.z] - date` heading, up to the next version. */
export interface ReleaseNotes {
  version: string
  date?: string
  /** Markdown. */
  body: string
}

/** Null for a version the changelog does not have, an empty section, and `Unreleased`. */
export function changelogSection(text: string, version: string): ReleaseNotes | null {
  const want = version.replace(/^v/, '')
  const lines = text.split(/\r?\n/)
  const heading = /^## \[([^\]]+)\](?:\s+-\s+(\S+))?\s*$/
  const start = lines.findIndex((l) => heading.exec(l)?.[1] === want)
  if (start < 0 || want.toLowerCase() === 'unreleased') return null
  const end = lines.findIndex((l, i) => i > start && (heading.test(l) || /^\[[^\]]+\]:\s/.test(l)))
  const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim()
  if (!body) return null
  const date = heading.exec(lines[start]!)?.[2]
  return { version: want, ...(date && { date }), body }
}
