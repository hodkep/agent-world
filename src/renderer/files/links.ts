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

// A folder: a relative one written with its trailing slash (`src/renderer/`), or an absolute or home one of two folders or more (`~/work/shop`). Whether it is one is checked on disk.
const FOLDER_REL = /(?<![\w@%+./~:-])((?:~\/|\.{1,2}\/|\/)?(?:[\w@%+.,~-]+\/)+)(?![\w@%+-])/g
const FOLDER_ABS = /(?<![\w@%+./~:-])((?:~\/|\/)(?:[\w@%+.,~-]+\/)+[\w@%+.,~-]+)(?![\w/@%+-])/g

/** Places in a sentence that look like the path of a folder; anything that is also the path of a file is left to `findPathCandidates`. */
export function findFolderCandidates(text: string): Candidate[] {
  const files = findPathCandidates(text)
  const out: Candidate[] = []
  for (const re of [FOLDER_REL, FOLDER_ABS]) {
    for (const m of text.matchAll(re)) {
      const hit = m[1]!.replace(/[.,]+$/, '')
      const start = m.index!
      const end = start + hit.length
      if (!hit || files.some((f) => start < f.end && f.start < end) || out.some((o) => start < o.end && o.start < end)) continue
      out.push({ start, end, text: hit })
    }
  }
  return out.sort((x, y) => x.start - y.start)
}

/** The shown name of a file link: just the file's own name. */
export const linkName = (path: string) => path.replace(/\/+$/, '').split('/').pop() || path
