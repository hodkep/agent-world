// Builds the project site (hodkep.github.io/agent-world) from the repository's own Markdown: the user guide from docs/guide and
// the project documents under Documentation. Static files, no framework: `node scripts/build-site.mjs [outDir]` (default site-dist).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id'

export const SITE = 'https://hodkep.github.io/agent-world/'
const GITHUB = 'https://github.com/hodkep/agent-world'
const IMAGE = /\.(png|gif|svg|jpe?g|webp)$/i

// One Docs section, one menu: the user guide first, then how it works and the project's own documents. A guide file that is not listed still gets a page, under "More".
const MENU = [
  ['Start', [['getting-started'], ['install', 'Install', 'INSTALL.md']]],
  ['Use', [['the-office'], ['chat-and-dialogs'], ['customize-the-look'], ['code-and-preview'], ['workflows'], ['todos'], ['library-and-playbook']]],
  ['Help', [['settings-and-updates'], ['troubleshooting']]],
  ['How it works', [['providers', 'Providers', 'docs/providers-design.md'], ['remote-control', 'Remote control', 'docs/remote-control-design.md'], ['workflows-design', 'Workflows design', 'docs/workflows-design.md'], ['product', 'Product', 'PRODUCT.md'], ['design-system', 'Design system', 'DESIGN.md']]],
  ['Project', [['contributing', 'Contributing', 'CONTRIBUTING.md'], ['releasing', 'Releasing', 'RELEASING.md'], ['changelog', 'Changelog', 'CHANGELOG.md'], ['trademark', 'Name and logo', 'TRADEMARK.md']]]
]
const label = (slug) => slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** Every page, in menu order: { slug, label, group, src }. All live under docs/<slug>/. */
export function pagesOf(root) {
  const guide = new Set(readdirSync(join(root, 'docs', 'guide')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)))
  const listed = new Set(MENU.flatMap(([, items]) => items.map(([slug]) => slug)))
  const menu = [...MENU, ['More', [...guide].filter((g) => !listed.has(g)).map((g) => [g])]]
  return menu.flatMap(([group, items]) => items.filter(([slug, , src]) => src || guide.has(slug)).map(([slug, l, src]) => ({ slug, label: l ?? label(slug), group, src: src ?? `docs/guide/${slug}.md` })))
}

/** Where a link written in the document `from` (a path in the repository) goes on the site; an address on the site is relative to its top. */
export function resolveHref(href, from, pages) {
  if (/^(https?:|mailto:|data:)/.test(href) || href.startsWith('#')) return href
  const [path, hash = ''] = href.split('#')
  const target = posix.normalize(posix.join(posix.dirname(from), decodeURI(path)))
  const page = pages.find((p) => p.src === target)
  if (page) return `docs/${page.slug}/${hash && `#${hash}`}`
  if (IMAGE.test(target)) return `assets/${target}`
  // A link written for GitHub's own pages (`../../compare/…`, `../../releases/…`) from a document at the top or in docs/guide.
  const gh = target.replace(/^(\.\.\/)+/, '')
  if (/^(compare|releases|issues|pulls?|actions)(\/|$)/.test(gh)) return `${GITHUB}/${gh}${hash && `#${hash}`}`
  return `${GITHUB}/blob/main/${target}${hash && `#${hash}`}`
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const plain = (md) => md.replace(/<[^>]+>/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_>#|]/g, '').replace(/\s+/g, ' ').trim()
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '') + '…')

/** Each page is written at depth `d` below the top, so a path from the top is reached with d times `../`. */
const up = (d) => '../'.repeat(d)

function layout({ title, description, path, depth, body, active, side = '', toc = '', head = '' }) {
  const root = up(depth)
  const nav = [['', 'Home'], ['docs/getting-started/', 'Docs']].map(([p, t]) => `<a href="${root}${p}"${active === p ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('')
  const image = `${SITE}assets/docs/images/office-activities.png`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Agent World"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%2312101a'/%3E%3Crect x='1' y='1' width='6' height='6' fill='%23f2c230'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${root}site.css">${head}
</head><body data-root="${root}">
<header class="top"><a class="wm" href="${root}">Agent World</a><nav aria-label="Site">${nav}<a href="${GITHUB}/releases">Releases</a><a href="${GITHUB}">GitHub</a></nav><a class="btn" href="${GITHUB}/releases/latest">Download</a></header>
${body.startsWith('<!--bare-->') ? body : `<div class="page${side ? '' : ' solo'}">${side}<main>${body}</main>${toc}</div>`}
<footer class="foot"><span>© Agent World · Apache 2.0</span><a href="${GITHUB}">Repository</a><a href="${GITHUB}/releases">Releases</a><a href="${root}docs/install/">Install notes</a><a href="${root}docs/trademark/">Name and logo</a></footer>
<script src="${root}site.js" defer></script>
</body></html>
`
}

// The menu stands in a column that runs the height of the page; what is inside it sticks to the top as the page scrolls.
function sidebar(pages, page, root) {
  const groups = [...new Set(pages.map((p) => p.group))]
  const links = groups.map((g) => `<h4>${g}</h4>${pages.filter((p) => p.group === g).map((p) => `<a href="${root}docs/${p.slug}/"${p === page ? ' class="on" aria-current="page"' : ''}>${esc(p.label)}</a>`).join('')}`).join('')
  return `<aside><div class="side"><div class="search"><input type="search" placeholder="Search the docs" aria-label="Search the docs" data-search><kbd>⌘K</kbd></div><ol class="hits" data-hits hidden></ol><details class="menu" open><summary>Menu</summary><nav aria-label="Docs">${links}</nav></details></div></aside>`
}

function render(md, src, pages, depth) {
  const marked = new Marked(gfmHeadingId())
  const text = md.replace(/^---\n[\s\S]*?\n---\n/, '')
  let html = marked.parse(text)
  const heads = getHeadingList()
  const root = up(depth)
  html = html.replace(/\b(href|src)="([^"]+)"/g, (m, attr, v) => {
    const to = resolveHref(v.replace(/&amp;/g, '&'), src, pages)
    return `${attr}="${/^(https?:|mailto:|data:|#)/.test(to) ? to : root + to}"`
  })
  html = html.replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" rel="noopener"')
  // A release heading written as `[0.7.1] - date` shows without its brackets, linked or not.
  html = html.replace(/(<h[23][^>]*>)(?:<a [^>]*>)?\[?([\w.+-]+)\]?(?:<\/a>)?( - \d{4}-\d\d-\d\d)/g, '$1$2$3')
  return { html, heads, text }
}

export async function build(root, out) {
  rmSync(out, { recursive: true, force: true })
  const pages = pagesOf(root)
  const assets = new Set()
  const index = []
  const write = (path, text) => (mkdirSync(dirname(join(out, path)), { recursive: true }), writeFileSync(join(out, path), text))
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

  for (const page of pages) {
    const md = readFileSync(join(root, page.src), 'utf8')
    const { html, heads, text } = render(md, page.src, pages, 2)
    for (const m of html.matchAll(/src="(?:\.\.\/)+assets\/([^"]+)"/g)) assets.add(decodeURI(m[1]))
    const h1 = heads.find((h) => h.level === 1)?.text ?? page.label
    const first = plain(text.replace(/^# .*$/m, '').split(/\n\s*\n/).find((p) => plain(p).length > 40 && !/^\s*(#|<|!\[|\|)/.test(p)) ?? '')
    const description = clip(first || `${h1}: documentation of Agent World, a pixel-art office for your coding agents.`, 160)
    const at = pages.indexOf(page)
    const link = (p, dir) => (p ? `<a href="../${p.slug}/"${dir === 'next' ? ' class="next"' : ''}><small>${dir === 'prev' ? 'Previous' : 'Next'}</small><b>${esc(p.label)}</b></a>` : '<span></span>')
    const body = `${html}\n<div class="pn">${link(pages[at - 1], 'prev')}${link(pages[at + 1], 'next')}</div>\n<p class="edit"><a href="${GITHUB}/edit/main/${page.src}" rel="noopener">Edit this page on GitHub</a></p>`
    const tocItems = [...html.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({ id: m[1], text: m[2].replace(/<[^>]+>/g, '').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() }))
    const toc = tocItems.length ? `<nav class="toc" aria-label="On this page"><b>On this page</b>${tocItems.map((h) => `<a href="#${h.id}">${esc(h.text)}</a>`).join('')}</nav>` : ''
    const path = `docs/${page.slug}/`
    write(`${path}index.html`, layout({ title: `${h1} · Agent World docs`, description, path, depth: 2, body, active: 'docs/getting-started/', side: sidebar(pages, page, '../../'), toc }))
    index.push({ url: path, title: page.label, section: page.group, text: clip(plain(text), 3000) })
  }

  // /docs/ has nothing of its own: it opens the first page, with the menu beside it.
  const first = pages[0]
  write('docs/index.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Agent World docs</title><link rel="canonical" href="${SITE}docs/${first.slug}/"><meta http-equiv="refresh" content="0;url=${first.slug}/"><p><a href="${first.slug}/">Open the docs</a></p></html>\n`)

  const home = readFileSync(join(root, 'site', 'home.html'), 'utf8').replace(/\{\{version\}\}/g, version).replace(/\{\{root\}\}/g, '')
  for (const m of home.matchAll(/src="assets\/([^"]+)"/g)) assets.add(m[1])
  write('index.html', layout({ title: 'Agent World: run your coding agents from a pixel-art office', description: 'A desktop app for running Claude Code and Antigravity agents, each on its own git branch, shown as characters at their desks in a small office.', path: '', depth: 0, body: `<!--bare-->${home}`, active: '' }))
  write('404.html', layout({ title: 'Page not found · Agent World', description: 'This page does not exist. Go to the home page, the user guide or the documentation.', path: '404.html', depth: 0, body: '<div class="page solo"><main><h1>Page not found</h1><p><a href="./">Back to the home page</a>, or <a href="docs/getting-started/">open the docs</a>.</p></main></div>', active: '' }))

  for (const a of assets) {
    mkdirSync(dirname(join(out, 'assets', a)), { recursive: true })
    copyFileSync(join(root, a), join(out, 'assets', a))
  }
  for (const f of ['site.css', 'site.js']) copyFileSync(join(root, 'site', f), join(out, f))
  write('search.json', JSON.stringify(index))
  const urls = ['', ...pages.map((p) => `docs/${p.slug}/`)]
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`)
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`)
  write('.nojekyll', '')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  await build(root, resolve(root, process.argv[2] ?? 'site-dist'))
  console.log('site built')
}
