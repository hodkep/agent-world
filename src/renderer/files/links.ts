/** Places in a sentence that look like the path of a file. Whether it really is one is checked afterwards, on disk. */

export interface Candidate {
  start: number
  end: number
  text: string
}

// Not letters of a longer word on either side, so "and/or" or "a.b" inside a URL are not picked up.
const PATH = /(?<![\w@%+./~:-])((?:~\/|\.{1,2}\/|\/)?(?:[\w@%+.,~-]+\/)+[\w@%+.,~-]*[A-Za-z0-9][\w@%+.,~-]*\.[A-Za-z0-9]{1,8}|[\w-]+(?:\.[\w-]+)*\.[A-Za-z][A-Za-z0-9]{1,7})(?![\w/@%+-]|\.[A-Za-z0-9])/g

export function findPathCandidates(text: string): Candidate[] {
  const out: Candidate[] = []
  for (const m of text.matchAll(PATH)) {
    const hit = m[1]!
    const start = m.index!
    // (A web address never matches: a path cannot start right after a letter or a colon.)
    if (/^\d+(\.\d+)+$/.test(hit)) continue
    out.push({ start, end: start + hit.length, text: hit })
  }
  return out
}

/** The shown name of a file link: just the file's own name. */
export const linkName = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
