import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by the Pages workflow
import { SITE, build, pagesOf, resolveHref } from './build-site.mjs'

const root = resolve(__dirname, '..')
const out = mkdtempSync(join(tmpdir(), 'aw-site-'))
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

beforeAll(async () => void (await build(root, out)), 60_000)

describe('the project site', () => {
  it('has a page for every guide topic and every project document, each under its own section', () => {
    const pages = pagesOf(root) as { section: string; slug: string; src: string }[]
    const guide = readdirSync(join(root, 'docs', 'guide')).filter((f) => f.endsWith('.md'))
    expect(pages.filter((p) => p.section === 'guide').map((p) => p.src).sort()).toEqual(guide.map((f) => `docs/guide/${f}`).sort())
    expect(pages.filter((p) => p.section === 'docs').map((p) => p.slug)).toEqual(expect.arrayContaining(['install', 'contributing', 'providers', 'changelog']))
    for (const p of pages) expect(existsSync(join(out, p.section, p.slug, 'index.html')), `${p.section}/${p.slug}`).toBe(true)
  })

  it('gives each page one h1, a title, a description and its own address for search engines', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
      const html = readFileSync(f, 'utf8')
      const rel = f.slice(out.length + 1)
      expect(html.match(/<h1[ >]/g)?.length, `${rel}: one h1`).toBe(1)
      expect(html, `${rel}: title`).toMatch(/<title>[^<]{3,}<\/title>/)
      expect(html, `${rel}: description`).toMatch(/<meta name="description" content="[^"]{20,}"/)
      expect(html, `${rel}: canonical`).toContain(`<link rel="canonical" href="${SITE}`)
    }
  })

  it('points every link, picture and script at a file the site has', () => {
    const missing: string[] = []
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
      const html = readFileSync(f, 'utf8')
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const t = m[1]!
        if (/^(https?:|mailto:|#|data:)/.test(t)) continue
        const path = resolve(dirname(f), decodeURIComponent(t.split('#')[0]!.split('?')[0]!))
        if (!(existsSync(path) && (!statSync(path).isDirectory() || existsSync(join(path, 'index.html'))))) missing.push(`${f.slice(out.length + 1)} → ${t}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('lists every page in the sitemap and lets search engines in', () => {
    const map = readFileSync(join(out, 'sitemap.xml'), 'utf8')
    expect(map).toContain(`<loc>${SITE}guide/the-office/</loc>`)
    expect(map).toContain(`<loc>${SITE}docs/install/</loc>`)
    expect(map).toContain(`<loc>${SITE}</loc>`)
    const robots = readFileSync(join(out, 'robots.txt'), 'utf8')
    expect(robots).toContain(`Sitemap: ${SITE}sitemap.xml`)
    expect(robots).not.toMatch(/Disallow: \//)
  })

  it('shows the version of the app on the home page, from package.json', () => {
    const v = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain(`v${v}`)
  })

  it('has a search index with every page', () => {
    const idx = JSON.parse(readFileSync(join(out, 'search.json'), 'utf8')) as { url: string; title: string }[]
    expect(idx.some((e) => e.url === 'guide/the-office/' && e.title === 'The office')).toBe(true)
  })
})

describe('where a link in a repository document goes on the site', () => {
  const pages = pagesOf(root)
  it('turns a link to another document that is on the site into its page', () => {
    expect(resolveHref('chat-and-dialogs.md#queue', 'docs/guide/the-office.md', pages)).toBe('guide/chat-and-dialogs/#queue')
    expect(resolveHref('../../DESIGN.md', 'docs/guide/the-office.md', pages)).toBe('docs/design-system/')
    expect(resolveHref('INSTALL.md', 'CONTRIBUTING.md', pages)).toBe('docs/install/')
  })
  it('turns a link to a file the site does not carry into the file on GitHub', () => {
    expect(resolveHref('src/main/index.ts', 'CONTRIBUTING.md', pages)).toBe('https://github.com/hodkep/agent-world/blob/main/src/main/index.ts')
    expect(resolveHref('../../LICENSE', 'docs/guide/the-office.md', pages)).toBe('https://github.com/hodkep/agent-world/blob/main/LICENSE')
  })
  it('leaves a link outside the site, and a link inside the page, as it is', () => {
    expect(resolveHref('https://example.com/x', 'README.md', pages)).toBe('https://example.com/x')
    expect(resolveHref('#top', 'README.md', pages)).toBe('#top')
  })
})
