// Words in a path that name a place in the program, not a feature of it.
const GLUE = new Set(['src', 'main', 'renderer', 'shared', 'preload', 'panel', 'panels', 'components', 'component', 'test', 'tests', 'e2e', 'pilot', 'docs', 'doc', 'scripts', 'index', 'app', 'types', 'type', 'styles', 'style', 'api', 'utils', 'util', 'lib', 'common', 'format', 'node', 'modules', 'public', 'assets', 'config', 'package', 'readme', 'tsconfig', 'electron', 'vite', 'vitest', 'playwright', 'eslint', 'prettier', 'gitignore', 'claude', 'agy', 'view', 'modal', 'pane'])
const EXT = /\.(test|spec|e2e|pilot)?\.?[a-z0-9]+$/i
const SKIP = /(^|\/)(docs?|node_modules|dist|out)\//

/** The words of one path segment, split at case changes and dashes: `LibraryReach.tsx` is library, reach. */
const wordsOf = (segment: string): string[] =>
  segment
    .replace(EXT, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)

const singular = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** The feature one file belongs to: the first folder below the generic ones (src/main/library → library), else the first word of its name (LibraryReach.tsx → library). */
function featureOf(path: string): { key: string; shown: string } | undefined {
  if (SKIP.test(path)) return undefined
  const parts = path.split('/')
  const file = parts.pop() ?? ''
  const dir = parts.map((p) => wordsOf(p)[0]).find((w) => w && !GLUE.has(w) && !GLUE.has(singular(w)))
  const word = dir ?? wordsOf(file).find((w) => !GLUE.has(w) && !GLUE.has(singular(w)))
  return word ? { key: singular(word), shown: word } : undefined
}

/** The area of the project a set of changed files belongs to, named after the feature most of them are in, or undefined when they point to none. */
export function areaOfFiles(files: string[]): string | undefined {
  const count = new Map<string, { n: number; shown: Map<string, number> }>()
  for (const f of files) {
    const a = featureOf(f)
    if (!a) continue
    const c = count.get(a.key) ?? { n: 0, shown: new Map() }
    c.n++
    c.shown.set(a.shown, (c.shown.get(a.shown) ?? 0) + 1)
    count.set(a.key, c)
  }
  const best = [...count.entries()].sort((x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0]))[0]
  if (!best) return undefined
  const shown = [...best[1].shown.entries()].sort((x, y) => y[1] - x[1] || y[0].length - x[0].length)[0]![0]
  return title(shown)
}
