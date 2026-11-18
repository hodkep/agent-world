import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by the Pages workflow
import { BUILDING, SITE, build, headingText, pagesOf, resolveHref } from './build-site.mjs'
// @ts-expect-error a plain browser script, copied to the site as it is
import { STEPS, tipSide } from '../site/demo.js'

const root = resolve(__dirname, '..')
const out = mkdtempSync(join(tmpdir(), 'aw-site-'))
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

beforeAll(async () => void (await build(root, out)), 60_000)

describe('the project site', () => {
  it('has one Docs section with a page for every guide topic and every project document', () => {
    const pages = pagesOf(root) as { slug: string; src: string }[]
    const guide = readdirSync(join(root, 'docs', 'guide')).filter((f) => f.endsWith('.md'))
    expect(pages.filter((p) => p.src.startsWith('docs/guide/')).map((p) => p.src).sort()).toEqual(guide.map((f) => `docs/guide/${f}`).sort())
    expect(pages.map((p) => p.slug)).toEqual(expect.arrayContaining(['install', 'contributing', 'providers', 'changelog']))
    expect(new Set(pages.map((p) => p.slug)).size).toBe(pages.length)
    for (const p of pages) expect(existsSync(join(out, 'docs', p.slug, 'index.html')), p.slug).toBe(true)
  })

  it('gives each page one h1, a title, a description and its own address for search engines', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
      const html = readFileSync(f, 'utf8')
      const rel = f.slice(out.length + 1)
      if (html.includes('http-equiv="refresh"')) continue // /docs/ only sends the reader on to the first page
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
        const target = decodeURIComponent(t.split('#')[0]!.split('?')[0]!)
        const path = target.startsWith('/') ? join(out, target) : resolve(dirname(f), target)
        if (!(existsSync(path) && (!statSync(path).isDirectory() || existsSync(join(path, 'index.html'))))) missing.push(`${f.slice(out.length + 1)} → ${t}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('lists every page in the sitemap and lets search engines in', () => {
    const map = readFileSync(join(out, 'sitemap.xml'), 'utf8')
    expect(map).toContain(`<loc>${SITE}docs/the-office/</loc>`)
    expect(map).toContain(`<loc>${SITE}docs/install/</loc>`)
    expect(map).toContain(`<loc>${SITE}</loc>`)
    const robots = readFileSync(join(out, 'robots.txt'), 'utf8')
    expect(robots).toContain(`Sitemap: ${SITE}sitemap.xml`)
    expect(robots).not.toMatch(/Disallow: \//)
  })

  it('shows the film on the home page: a video the visitor starts, with its poster, both carried by the site', () => {
    const home = readFileSync(join(out, 'index.html'), 'utf8')
    const video = /<video\b[^>]*>/.exec(home)?.[0] ?? ''
    expect(video).toContain('controls')
    expect(video).toContain('preload="none"')
    expect(video).toContain('playsinline')
    expect(video).not.toContain('autoplay')
    expect(video).toContain('poster="assets/docs/images/video-poster.jpg"')
    expect(home).toMatch(/<source src="assets\/docs\/video\/agent-world\.mp4" type="video\/mp4">/)
    for (const f of ['docs/images/video-poster.jpg', 'docs/video/agent-world.mp4']) expect(existsSync(join(out, 'assets', f)), f).toBe(true)
  })

  it('shows the version of the app on the home page, from package.json', () => {
    const v = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain(`v${v}`)
  })

  it('shows a release in the changelog as its number and date, with a clean list on the page', () => {
    const html = readFileSync(join(out, 'docs', 'changelog', 'index.html'), 'utf8')
    expect(html).not.toMatch(/class="toc"[^]*?&lt;a/)
    expect(html).not.toMatch(/<a href="[^"]*">\s*&lt;a/)
    const toc = html.slice(html.indexOf('aria-label="On this page"'), html.indexOf('</nav>', html.indexOf('aria-label="On this page"')))
    const items = [...toc.matchAll(/<a href="#[^"]+">([^<]*)<\/a>/g)].map((m) => m[1]!)
    expect(items.some((t) => /^0\.\d+\.\d+ - 20\d\d-\d\d-\d\d$/.test(t))).toBe(true)
    expect(items.filter((t) => /[\[\]]|&lt;/.test(t))).toEqual([])
  })

  it('has one docs menu on every page and no section index of its own', () => {
    const page = readFileSync(join(out, 'docs', 'the-office', 'index.html'), 'utf8')
    expect(page).toContain('aria-current="page">The office<')
    for (const l of ['Getting started', 'Providers', 'Changelog']) expect(page).toContain(`>${l}</a>`)
    expect(readFileSync(join(out, 'docs', 'index.html'), 'utf8')).toContain('http-equiv="refresh"')
    expect(existsSync(join(out, 'guide'))).toBe(false)
  })

  it('has a search index with every page', () => {
    const idx = JSON.parse(readFileSync(join(out, 'search.json'), 'utf8')) as { url: string; title: string }[]
    expect(idx.some((e) => e.url === 'docs/the-office/' && e.title === 'The office')).toBe(true)
  })

  it('wears the site look on every page: the fonts, the office scenes drawn in code, and the script that draws them', () => {
    const home = readFileSync(join(out, 'index.html'), 'utf8')
    const doc = readFileSync(join(out, 'docs', 'the-office', 'index.html'), 'utf8')
    // The display face is served by the site itself: no request to a font host.
    for (const html of [home, doc]) expect(html).not.toContain('fonts.googleapis.com')
    expect(existsSync(join(out, 'fonts', 'pixelify-sans.woff2'))).toBe(true)
    expect(readFileSync(join(out, 'site.css'), 'utf8')).toContain("src:url(fonts/pixelify-sans.woff2)")
    expect(home).toMatch(/<canvas [^>]*data-scene="facade"/)
    for (const room of ['workroom', 'meeting', 'shelf', 'dock']) expect(home, room).toMatch(new RegExp(`<canvas [^>]*data-scene="${room}"`))
    expect(doc).toMatch(/<canvas [^>]*data-scene="reader"/)
    expect(doc).not.toContain('data-scene="facade"')
    expect(existsSync(join(out, 'office.js'))).toBe(true)
    expect(home).toContain("from './office.js'") // a bare 'office.js' is not a module specifier a browser resolves
    expect(doc).toContain("from './../../office.js'")
    // The 404 page is served at whatever address was missing, so everything it loads starts at the top of the site.
    const lost = readFileSync(join(out, '404.html'), 'utf8')
    expect(lost).toContain('href="/site.css"')
    expect(lost).toContain("from '/office.js'")
    // The scenes are drawn from the app's own sprite and font bitmaps, written into the page so the script stays one file.
    expect(home).toContain('"GLYPHS":{')
    // The six engineers of the crew, drawn from the app's own character sprites: every view and pose, with their palettes.
    expect(home).toMatch(/"CHARS":\{"ada":\{"own":\{"pal":\{"o":"#1a1522"/)
    for (const k of ['bolt', 'cleo', 'dex', 'eve', 'finn']) expect(home).toContain(`"${k}":{"own":{"pal"`)
    expect(home).toContain('"boss":{"pal"') // the crown and the cap, for the engineers who share a section
    expect(home).toContain('"intern":{"pal"')
    expect(home).toContain('"courier":{"own"') // the one who brings the dmg
    // The screenshot behind every window's state is on the page, so the site carries it.
    for (const st of ['idle', 'thinking', 'running', 'permission', 'asleep']) expect(home).toMatch(new RegExp(`<figure class="peek" data-state="${st}"[^>]*><img src="assets/docs/images/[^"]+\\.png"`))
    expect(home).toMatch(/"side":\{"stand":\["[.o]{16}"/)
    // The home page starts hidden only while the crew builds it, from a line in its head that also lets go after a while if the script never runs.
    expect(home).toContain("classList.add('building')")
    expect(doc).not.toContain("classList.add('building')")
  })
})

describe('the demo tour', () => {
  type Step = { img: string; part: string; title: string; text: string; x?: number; y?: number; w?: number; h?: number; end?: boolean; before?: string }
  const steps = STEPS as Step[]

  it('has its own page, linked from the top of every page and from the home page, and listed in the sitemap', () => {
    const demo = readFileSync(join(out, 'demo', 'index.html'), 'utf8')
    expect(demo).toContain(`<link rel="canonical" href="${SITE}demo/">`)
    expect(demo).toMatch(/<a href="\.\.\/demo\/" class="on" aria-current="page">Demo<\/a>/)
    expect(readFileSync(join(out, 'docs', 'install', 'index.html'), 'utf8')).toContain('href="../../demo/">Demo</a>')
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toMatch(/<a class="btn alt" href="demo\/">Try the demo<\/a>/)
    expect(readFileSync(join(out, 'sitemap.xml'), 'utf8')).toContain(`<loc>${SITE}demo/</loc>`)
    expect(existsSync(join(out, 'demo.js'))).toBe(true)
  })

  it('shows a real screen of the app at every step, carried by the site, with the spot to click inside the picture', () => {
    expect(steps.length).toBeGreaterThan(10)
    for (const s of steps) {
      for (const img of [s.img, s.before].filter(Boolean)) expect(existsSync(join(out, 'assets', 'docs', 'images', 'demo', `${img}.jpg`)), img).toBe(true)
      expect(s.title.length, s.img).toBeGreaterThan(5)
      if (s.end) continue
      expect(s.text.length, s.title).toBeGreaterThan(30)
      for (const [a, b] of [[s.x! - s.w! / 2, s.x! + s.w! / 2], [s.y! - s.h! / 2, s.y! + s.h! / 2]]) {
        expect(a, s.title).toBeGreaterThanOrEqual(0)
        expect(b, s.title).toBeLessThanOrEqual(100)
      }
    }
    expect(steps.at(-1)!.end).toBe(true)
    expect(steps.filter((s) => s.end)).toHaveLength(1)
  })

  it('puts a step\'s card on the side of its spot with more room, so the card never covers the spot', () => {
    expect(tipSide({ x: 20, y: 10, w: 4, h: 4 })).toEqual({ left: 25, right: null, top: 16, bottom: null })
    expect(tipSide({ x: 80, y: 90, w: 10, h: 4 })).toEqual({ left: null, right: 28, top: null, bottom: 16 })
    expect(tipSide({ x: 5, y: 2, w: 100, h: 100 })).toEqual({ left: 54, right: null, top: 50, bottom: null })
  })
})

describe('where a link in a repository document goes on the site', () => {
  const pages = pagesOf(root)
  it('turns a link to another document that is on the site into its page', () => {
    expect(resolveHref('chat-and-dialogs.md#queue', 'docs/guide/the-office.md', pages)).toBe('docs/chat-and-dialogs/#queue')
    expect(resolveHref('../../DESIGN.md', 'docs/guide/the-office.md', pages)).toBe('docs/design-system/')
    expect(resolveHref('INSTALL.md', 'CONTRIBUTING.md', pages)).toBe('docs/install/')
  })
  it('turns a link to a file the site does not carry into the file on GitHub', () => {
    expect(resolveHref('src/main/index.ts', 'CONTRIBUTING.md', pages)).toBe('https://github.com/hodkep/agent-world/blob/main/src/main/index.ts')
    expect(resolveHref('../../LICENSE', 'docs/guide/the-office.md', pages)).toBe('https://github.com/hodkep/agent-world/blob/main/LICENSE')
  })
  it('turns a link written for the repository GitHub pages into that page', () => {
    expect(resolveHref('../../compare/v0.6.0...v0.7.0', 'CHANGELOG.md', pages)).toBe('https://github.com/hodkep/agent-world/compare/v0.6.0...v0.7.0')
    expect(resolveHref('../../releases/tag/v0.1.0', 'CHANGELOG.md', pages)).toBe('https://github.com/hodkep/agent-world/releases/tag/v0.1.0')
    expect(resolveHref('../../releases', 'docs/guide/the-office.md', pages)).toBe('https://github.com/hodkep/agent-world/releases')
  })
  it('leaves a link outside the site, and a link inside the page, as it is', () => {
    expect(resolveHref('https://example.com/x', 'README.md', pages)).toBe('https://example.com/x')
    expect(resolveHref('#top', 'README.md', pages)).toBe('#top')
  })

})

describe('the heading text in a page\'s contents', () => {
  it('is the words of the heading: tags gone, entities read', () => {
    expect(headingText('<code>pnpm</code> &amp; <em>more</em> &quot;x&quot; &#39;y&#39;')).toBe('pnpm & more "x" \'y\'')
  })

  it('leaves no tag behind when stripping one makes another, and the entities read afterwards are not stripped as tags', () => {
    expect(headingText('<<i>script>alert(1)<<i>/script>')).toBe('alert(1)')
    expect(headingText('a &lt;b&gt; c')).toBe('a <b> c')
  })
})

describe('the site on a slow network', () => {
  const files = () => walk(out).filter((x) => x.endsWith('.html'))

  it('loads every picture of every page lazily, with its size, so nothing shifts and hidden pictures wait to be shown', () => {
    for (const f of files()) {
      const html = readFileSync(f, 'utf8')
      for (const tag of html.match(/<img\b[^>]*>/g) ?? []) {
        expect(tag, `${f.slice(out.length)}: ${tag.slice(0, 80)}`).toMatch(/\sloading="lazy"/)
        expect(tag, tag.slice(0, 80)).toMatch(/\sdecoding="async"/)
        expect(tag, tag.slice(0, 80)).toMatch(/\sheight="\d+"/)
        expect(tag, tag.slice(0, 80)).toMatch(/\swidth="\d+"/)
      }
    }
  })

  it('keeps the shape of a picture whose width the page chose', () => {
    const home = readFileSync(join(out, 'index.html'), 'utf8')
    const tag = home.match(/<img\b[^>]*run-card\.png[^>]*>/)?.[0] ?? ''
    const [w, h] = [+tag.match(/\swidth="(\d+)"/)![1], +tag.match(/\sheight="(\d+)"/)![1]]
    expect(Math.abs(w / h - 1032 / 427)).toBeLessThan(0.02)
  })

  it('preloads the script that starts the crew and the font of the headings on the home page, and the film waits to be played', () => {
    const home = readFileSync(join(out, 'index.html'), 'utf8')
    expect(home).toContain('<link rel="modulepreload" href="office.js">')
    expect(home).toMatch(/<link rel="preload" href="fonts\/pixelify-sans\.woff2" as="font" type="font\/woff2" crossorigin>/)
    expect(home).toMatch(/<video[^>]*preload="none"/)
  })

  it('keeps what the first screen cannot do without small: the page, the styles, the script and the font stay under 60 KB on the wire', () => {
    const wire = ['index.html', 'site.css', 'site.js', 'office.js'].map((f) => gzipSync(readFileSync(join(out, f))).length).reduce((a, b) => a + b, 0) + statSync(join(out, 'fonts/pixelify-sans.woff2')).size
    expect(wire).toBeLessThan(60 * 1024)
  })

  const run = (connection: object | undefined, width = 1440) => {
    const classes = new Set<string>()
    const document = { documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } } }
    new Function('document', 'navigator', 'matchMedia', 'innerWidth', 'setTimeout', 'window', (BUILDING as string).replace(/^<script>|<\/script>$/g, ''))(document, { connection }, () => ({ matches: false }), width, () => 0, {})
    return classes
  }

  it('marks a slow connection before anything is drawn, so the headline, the words and the buttons show at once', () => {
    expect([...run({ effectiveType: '3g' })].sort()).toEqual(['building', 'slow'])
    expect([...run({ saveData: true })].sort()).toEqual(['building', 'slow'])
    expect([...run({ effectiveType: '4g', downlink: 0.9 })].sort()).toEqual(['building', 'slow'])
  })

  it('does not change the opening on a fast connection, or on a phone or small window where nothing is built', () => {
    expect([...run({ effectiveType: '4g', downlink: 10 })]).toEqual(['building'])
    expect([...run(undefined)]).toEqual(['building'])
    expect([...run({ effectiveType: '3g' }, 700)]).toEqual([])
  })
})
