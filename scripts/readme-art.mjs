// Draws the README's pixel art as SVG: the banner (the app's own wordmark font, figure and palette, DESIGN.md) and the small icons beside the section headings.
// Nothing is downloaded and no font is used: every mark is a rectangle on a pixel grid. Run: pnpm readme:art
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SPRITE } from '../src/renderer/pixel/glyphs.ts'
import { GLYPHS, textPixels } from '../src/renderer/world/pixelfont.ts'

// README_ART_OUT: where to write (a test points it at a temp folder).
const OUT = process.env.README_ART_OUT ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images')

// The palette of DESIGN.md.
const C = {
  night: '#12101a', panel: '#1a1726', ink: '#08070c', text: '#e4e4ee', muted: '#a4a2b8', dim: '#4a4860', brass: '#f2c230', brassDim: '#5a4c1e', cyan: '#6ad0e0',
  green: '#5f9e5f', greenText: '#9fdc9f', red: '#d83a3a', violet: '#b38bff', claude: '#e08a5a', wall: '#2c3350', trim: '#3c4568', paper: '#f6f6fa',
  plankA: '#8e5b34', plankB: '#87552f', plankC: '#94613a', seam: '#6a4124', desk: '#c68e57', crt: '#d9d5c8', hair: '#3a2a22', skin: '#e8b890', skinShade: '#c9966c'
}

/** A grid of art pixels that comes out as SVG rectangles, one per horizontal run of one colour. */
class Canvas {
  constructor(w, h, bg = null) {
    this.w = w
    this.h = h
    this.px = Array.from({ length: h }, () => Array(w).fill(bg))
  }
  set(x, y, c) {
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
  /** A bitmap of rows, '.' empty, other letters looked up in `pal`; each bitmap pixel is `s` art pixels square. */
  blit(rows, x, y, pal, s = 1) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] && this.rect(x + i * s, y + j * s, s, s, pal[ch])))
  }
  text(str, x, y, color, s = 1, shadow = null) {
    const rows = textPixels(str)
    if (shadow) this.blit(rows.map((r) => r.replaceAll('#', 's')), x + s, y + s, { s: shadow }, s)
    this.blit(rows.map((r) => r.replaceAll('#', 't')), x, y, { t: color }, s)
    return rows[0].length * s
  }
  svg(scale, title) {
    const runs = []
    for (let y = 0; y < this.h; y++) {
      let x = 0
      while (x < this.w) {
        const c = this.px[y][x]
        let e = x + 1
        while (e < this.w && this.px[y][e] === c) e++
        if (c) runs.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${c}"/>`)
        x = e
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w * scale}" height="${this.h * scale}" shape-rendering="crispEdges" role="img" aria-label="${title}"><title>${title}</title>${runs.join('')}</svg>\n`
  }
}

const figure = (shirt) => ({ H: C.hair, S: C.skin, B: shirt, L: '#2d3552' })

// ---- The banner: the office's wall and wood floor, the wordmark in the top bar's own lettering, and five agents in five states.
function banner() {
  const W = 160
  const H = 54
  const cv = new Canvas(W, H, C.night)
  const WALL = 32
  cv.rect(0, 0, W, WALL, C.wall)
  cv.rect(0, WALL - 2, W, 1, C.trim)
  cv.rect(0, WALL - 1, W, 1, C.ink)
  // The floor: planks in three tones with seams, as in the office.
  const tones = [C.plankA, C.plankB, C.plankC]
  for (let y = WALL; y < H; y += 4) {
    cv.rect(0, y, W, 4, tones[((y - WALL) / 4) % 3 | 0])
    cv.rect(0, y + 3, W, 1, C.seam)
    for (let x = ((y - WALL) / 4) % 2 ? 9 : 25; x < W; x += 32) cv.rect(x, y, 1, 3, C.seam)
  }
  // A window and a clock on the wall, the office's two oldest props, clear of the lettering.
  cv.rect(124, 3, 32, 15, C.ink)
  cv.rect(125, 4, 30, 13, '#243a6a')
  cv.rect(140, 4, 1, 13, C.ink)
  cv.rect(125, 10, 30, 1, C.ink)
  cv.rect(127, 6, 4, 1, '#4a6aa8')
  cv.rect(144, 12, 6, 1, '#3a5a98')
  cv.rect(108, 5, 9, 9, C.ink)
  cv.rect(109, 6, 7, 7, C.paper)
  cv.rect(112, 7, 1, 3, C.ink)
  cv.rect(112, 9, 3, 1, C.ink)
  // The wordmark, with the shadow the top bar gives it.
  cv.text('agent world', 6, 6, C.brass, 2, C.ink)
  cv.text('run and steer your coding agents', 7, 21, C.muted, 1, C.ink)
  // Five agents, each at a desk with a CRT, in a different state.
  const spots = [
    { x: 8, shirt: C.cyan, state: 'idle' },
    { x: 40, shirt: C.violet, state: 'thinking' },
    { x: 72, shirt: C.greenText, state: 'running' },
    { x: 104, shirt: C.claude, state: 'permission' },
    { x: 136, shirt: '#8a8fb8', state: 'asleep' }
  ]
  for (const s of spots) {
    const feet = 50
    const y = feet - SPRITE.length
    cv.blit(SPRITE, s.x + 6, y, figure(s.shirt))
    // The desk in front of the legs, and the CRT on it.
    cv.rect(s.x, feet - 5, 22, 4, C.desk)
    cv.rect(s.x, feet - 2, 22, 1, C.seam)
    cv.rect(s.x + 1, feet - 12, 7, 6, C.crt)
    cv.rect(s.x + 2, feet - 11, 5, 4, s.state === 'running' ? C.green : s.state === 'asleep' ? C.ink : '#1a2a4a')
    cv.rect(s.x + 3, feet - 6, 3, 1, C.crt)
    if (s.state === 'running') for (const [i, j] of [[3, 0], [3, 2], [5, 1]]) cv.rect(s.x + i, feet - 10 + j, 2, 1, C.greenText)
    if (s.state === 'thinking') for (let i = 0; i < 3; i++) cv.rect(s.x + 9 + i * 3, y - 4, 2, 2, C.cyan)
    if (s.state === 'permission') {
      // The speech bubble of a permission request, with the exclamation mark in the world's own font.
      cv.rect(s.x + 9, y - 11, 11, 9, C.ink)
      cv.rect(s.x + 10, y - 10, 9, 7, C.paper)
      cv.rect(s.x + 11, y - 2, 2, 2, C.paper)
      cv.blit(GLYPHS['!'].map((r) => r.replaceAll('#', 'b')), s.x + 13, y - 9, { b: C.red })
    }
    if (s.state === 'asleep') {
      cv.blit(GLYPHS.z.map((r) => r.replaceAll('#', 'z')), s.x + 10, y - 7, { z: C.muted })
      cv.blit(GLYPHS.z.map((r) => r.replaceAll('#', 'z')), s.x + 15, y - 11, { z: C.dim })
    }
  }
  return cv.svg(6, 'Agent World: a pixel-art office with five agents, each in a different state')
}

// ---- The icons beside the headings: 12 grid, each bitmap centred, in the palette of the app.
const P = { b: C.brass, d: C.brassDim, c: C.cyan, g: C.greenText, r: C.red, p: C.text, m: C.muted, w: C.plankC, v: C.violet, o: C.ink, h: C.hair, s: C.skin, l: '#2d3552' }
const fig = (shirt) => SPRITE.map((r) => r.replaceAll('H', 'h').replaceAll('S', 's').replaceAll('L', 'l').replaceAll('B', shirt))
const ICONS = {
  office: fig('c'),
  chat: ['.pppppppppp.', '.p........p.', '.p.b.b.b..p.', '.p........p.', '.pppppppppp.', '..pp........', '.pp.........'],
  permission: ['.pppppppppp.', '.p........p.', '.p......g.p.', '.p.g...g..p.', '.p..g.g...p.', '.p...g....p.', '..p......p..', '...p....p...', '....pppp....'],
  worktrees: ['..bbb..bbb..', '..b.b..b.b..', '..bbb..bbb..', '...c....c...', '...c....c...', '...c....c...', '...ccccccc..', '...c........', '..bbb.......', '..b.b.......', '..bbb.......'],
  workflows: ['ggg.ggg.bbb.', 'gggggggmbbb.', 'ggg.ggg.bbb.'],
  library: ['.bbbb.bbbb.', '.bmmb.bmmb.', '.b..b.b..b.', '.bmmb.bmmb.', '.b..b.b..b.', '.bmmb.bmmb.', '.bbbb.bbbb.'],
  todos: ['..bbbbbbb..', '.bpppppppb.', '.bpgpmmmpb.', '.bpppppppb.', '.bpgpmmmpb.', '.bpppppppb.', '.bpgpmmmpb.', '.bpppppppb.', '..bbbbbbb..'],
  usage: ['......bbb.', '.....bbb..', '....bbb...', '...bbbbbb.', '.....bbb..', '....bbb...', '...bb.....', '...b......'],
  agents: [...fig('c').map((r) => `${r}.`), ].map((r, i) => `${r}${fig('v')[i]}`),
  hooks: ['.b..b.', '.b..b.', 'bbbbbb', 'bbbbbb', '.bbbb.', '..bb..', '..bb..', '..bb..'],
  status: ['b.........', 'bbbbbb....', 'bbbbbbbb..', 'bbbbbb....', 'b.........', 'b.........', 'b.........', 'b.........'],
  build: ['mmmmmmmmmmm', 'm.........m', 'm.b.......m', 'm..b......m', 'm.b..ppp..m', 'm.........m', 'mmmmmmmmmmm'],
  notes: ['bbbbbbbbb', 'pppppppp.', 'pmmmmmmp.', 'p......p.', 'pmmmmmmp.', 'p......p.', 'pmmmm.mp.', 'p......p.', 'pppppppp.'],
  tokens: ['..bbbbbb..', '.bddddddb.', '..bbbbbb..', '..bbbbbb..', '.bddddddb.', '..bbbbbb..', '..bbbbbb..', '.bddddddb.', '..bbbbbb..'],
  labels: ['bbbbbb....', 'bbbbbbbb..', 'bboobbbbb.', 'bboobbbbbb', 'bbbbbbbbb.', 'bbbbbbbb..', 'bbbbbb....'],
  marks: ['.pppppppp.r', '.p......prr', '.p.cc...pr.', '.p.cc...p..', '.p......p..', '.pppppppp..'],
  btw: ['..pppppp..', '.p......p.', 'p..b.b.b.p', '.p......p.', '..pppppp..', '.pp.......'],
  diagrams: ['bbb...bbb', 'b.b...b.b', 'bbb...bbb', '.m.....m.', '.mmmmmmm.', '....m....', '..ccccc..', '..c...c..', '..ccccc..'],
  forms: ['pppppppppp', 'p........p', 'p.mmmm...p', 'p........p', 'p.gg.mmm.p', 'p........p', 'p.bbbb...p', 'p........p', 'pppppppppp'],
  accounts: ['..bbb.....', '.b...b....', '.b...b....', '..bbb.....', '...b......', '...bbbbbb.', '...b..b.b.', '...b..b.b.'],
  terminals: ['mmmmmmmmmmm', 'm.bb.mm...m', 'mmmmmmmmmmm', 'm.........m', 'm.g.......m', 'm..g.ppp..m', 'mmmmmmmmmmm'],
  shortcuts: ['mmmmmmmmmmmm', 'm.p.p.p.p.pm', 'mmmmmmmmmmmm', 'm.p.p.p.p.pm', 'mmmmmmmmmmmm', 'm..pppppp..m', 'mmmmmmmmmmmm'],
  contributing: ['.rr...rr.', 'rrrr.rrrr', 'rrrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  licence: ['.pppppp..', '.p....pp.', '.p....p.p', '.pmmmm..p', '.p......p', '.pmmmm..p', '.p......p', '.pppppppp']
}

function icon(rows) {
  const w = Math.max(...rows.map((r) => r.length))
  const cv = new Canvas(12, 12)
  cv.blit(rows, Math.floor((12 - w) / 2), Math.floor((12 - rows.length) / 2), P)
  return cv
}

mkdirSync(join(OUT, 'icons'), { recursive: true })
writeFileSync(join(OUT, 'banner.svg'), banner())
for (const [name, rows] of Object.entries(ICONS)) writeFileSync(join(OUT, 'icons', `${name}.svg`), icon(rows).svg(2, `${name} icon`))
console.log(`banner.svg and ${Object.keys(ICONS).length} icons in docs/images`)
