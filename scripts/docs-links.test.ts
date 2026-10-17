import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const pages = ['README.md', ...(existsSync(join(root, 'docs', 'guide')) ? readdirSync(join(root, 'docs', 'guide')).filter((f) => f.endsWith('.md')).map((f) => join('docs', 'guide', f)) : [])]

/** Every local target a page points at: markdown links and images, and the src and href of the html the README uses for its banner and icons. */
function targets(text: string): string[] {
  const found = [...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!)
  for (const m of text.matchAll(/(?:src|href|srcset)="([^"]+)"/g)) found.push(m[1]!)
  // `../../releases` and its kind are GitHub's own pages, reached from a README at the top of the repository: there is no such file to find.
  return found.filter((t) => !/^(https?:|mailto:|#|data:)/.test(t) && !/^\.\.\/\.\.\/(releases|issues|actions|pulls)\b/.test(t)).map((t) => t.split('#')[0]!.split('?')[0]!).filter(Boolean)
}

describe('the README and the user guide', () => {
  for (const page of pages) {
    it(`${page} points only at files that exist`, () => {
      const dir = dirname(join(root, page))
      const missing = targets(readFileSync(join(root, page), 'utf8')).filter((t) => !existsSync(resolve(dir, decodeURIComponent(t))))
      expect(missing).toEqual([])
    })
  }

  it('has a page for every area, each linked from the README', () => {
    const guide = join(root, 'docs', 'guide')
    if (!existsSync(guide)) return
    const readme = readFileSync(join(root, 'README.md'), 'utf8')
    for (const f of readdirSync(guide).filter((x) => x.endsWith('.md'))) expect(readme, `README links docs/guide/${f}`).toContain(`docs/guide/${f}`)
  })
})
