// The pixel scenes of the site, drawn in code from the app's own sprite and font bitmaps (DESIGN.md: no raster art).
// scene(name, bits, t, extra) is pure: a grid of colours for the moment t in ms. mount() draws every <canvas data-scene> and keeps it alive.
const C = { night: '#12101a', ink: '#08070c', text: '#e4e4ee', muted: '#a4a2b8', dim: '#4a4860', brass: '#f2c230', cyan: '#6ad0e0', green: '#5f9e5f', greenText: '#9fdc9f', red: '#d83a3a', violet: '#b38bff', claude: '#e08a5a', wall: '#2c3350', trim: '#3c4568', paper: '#f6f6fa', plankA: '#8e5b34', plankB: '#87552f', plankC: '#94613a', seam: '#6a4124', desk: '#c68e57', crt: '#d9d5c8', hair: '#3a2a22', skin: '#e8b890', glass: '#1a2a4a', grass: '#2f5a2f', walk: '#8a8a92', road: '#2a2a30', door: '#3a2a22', book: '#6a4124' }
const SPINES = ['#c0392b', '#2980b9', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22']
export const CREW = ['ada', 'bolt', 'cleo', 'dex', 'eve', 'finn']
const STATES = [['ada', 'idle'], ['bolt', 'thinking'], ['cleo', 'running'], ['dex', 'permission'], ['eve', 'asleep']]

class Grid {
  constructor(w, h, bg) { this.w = w; this.h = h; this.px = Array.from({ length: h }, () => Array(w).fill(bg)) }
  set(x, y, c) { if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c) }
  box(x, y, w, h, fill) { this.rect(x, y, w, h, C.ink); this.rect(x + 1, y + 1, w - 2, h - 2, fill) }
  blit(rows, x, y, pal) { rows.forEach((row, j) => [...row].forEach((ch, i) => ch !== '.' && pal[ch] && this.set(x + i, y + j, pal[ch]))) }
}
const glyph = (bits, ch, c) => ({ rows: bits.GLYPHS[ch].map((r) => r.replaceAll('#', 'g')), pal: { g: c } })
const beat = (t, ms) => Math.floor(t / ms)
/** One of the app's characters at (x, y), its top-left; `flip` turns a side view to face left. */
function character(g, bits, name, view, pose, x, y, flip = false) {
  const ch = bits.CHARS[name]['own'], rows = ch[view][pose]
  rows.forEach((row, j) => [...row].forEach((c, i) => c !== '.' && ch.pal[c] && g.set(x + (flip ? 15 - i : i), y + j, ch.pal[c])))
}

function planks(g, x0, y0, w, h) {
  const t = [C.plankA, C.plankB, C.plankC]
  for (let y = y0; y < y0 + h; y += 4) { g.rect(x0, y, w, 4, t[((y - y0) / 4) % 3 | 0]); g.rect(x0, y + 3, w, 1, C.seam); for (let x = x0 + (((y - y0) / 4) % 2 ? 9 : 25); x < x0 + w; x += 32) g.rect(x, y, 1, 3, C.seam) }
}
function shelf(g, x, y) {
  g.box(x, y, 14, 16, C.hair)
  for (let r = 0; r < 3; r++) { g.rect(x + 1, y + 5 + r * 5, 12, 1, C.ink); for (let i = 0; i < 6; i++) g.rect(x + 1 + i * 2, y + 1 + r * 5, 2, 4, SPINES[(i + r) % 6]) }
}
/** A desk with a CRT seen from the front, one of the characters seated behind it, in one state, alive at the moment t. */
function desk(g, bits, x, feet, name, state, t, crt = true) {
  const y = feet - 22
  character(g, bits, name, 'front', 'sit', x, y)
  if ((state === 'running' || state === 'thinking') && beat(t, 350) % 2) g.rect(x + 3, y + 17, 2, 1, bits.CHARS[name]['own'].pal.s)
  g.rect(x - 2, feet - 6, 28, 5, C.desk); g.rect(x - 2, feet - 2, 28, 1, C.seam)
  if (crt) { g.rect(x + 17, feet - 14, 8, 7, C.crt); g.rect(x + 18, feet - 13, 6, 5, state === 'running' ? C.green : state === 'asleep' ? C.ink : C.glass); g.rect(x + 20, feet - 7, 3, 1, C.crt) }
  if (state === 'running') for (const [i, j] of [[19, 0], [19, 2], [21, 1]]) g.rect(x + i, feet - 13 + ((j + beat(t, 200)) % 5), 2, 1, C.greenText)
  if (state === 'thinking') for (let i = 0; i < beat(t, 300) % 4; i++) g.rect(x + 4 + i * 3, y - 4, 2, 2, C.cyan)
  if (state === 'permission' && beat(t, 1200) % 3 !== 2) { g.rect(x + 8, y - 11, 11, 9, C.ink); g.rect(x + 9, y - 10, 9, 7, C.paper); g.rect(x + 10, y - 2, 2, 2, C.paper); const b = glyph(bits, '!', C.red); g.blit(b.rows, x + 12, y - 9, b.pal) }
  if (state === 'asleep') { const o = beat(t, 600) % 2; const z = glyph(bits, 'z', C.muted); g.blit(z.rows, x + 14, y - 6 - o, z.pal); const z2 = glyph(bits, 'z', C.dim); g.blit(z2.rows, x + 19, y - 10 + o, z2.pal) }
}
function walker(g, bits, name, x, feet, t, box) {
  const left = box === 'left'
  character(g, bits, name, 'side', beat(t, 130) % 2 ? 'walk1' : 'walk2', x, feet - 24, left)
  if (box) g.box(x + (left ? -6 : 12), feet - 9, 9, 7, C.desk)
}

const scenes = {
  // The building from the street at night: the windows light one by one, an agent at work in each; a courier walks the sidewalk.
  facade(g, bits, t, extra = {}) {
    for (const [x, y] of [[12, 8], [40, 20], [90, 6], [130, 14], [200, 9], [225, 24], [60, 3], [170, 26], [20, 28], [110, 22], [150, 4]]) g.set(x, y, C.muted)
    g.rect(0, 92, g.w, 10, C.grass); g.rect(0, 102, g.w, 6, C.walk); g.rect(0, 108, g.w, 12, C.road); for (let x = 4; x < g.w; x += 16) g.rect(x, 114, 8, 1, C.brass)
    g.rect(20, 28, 200, 66, C.ink); g.rect(22, 30, 196, 62, C.wall); g.rect(22, 30, 196, 2, C.trim)
    const order = [2, 0, 4, 1, 3]
    STATES.forEach(([name, st], i) => {
      const wx = 62 + i * 31, wy = 36, lit = t >= 400 + order.indexOf(i) * 500
      g.box(wx, wy, 30, 34, lit ? C.glass : '#0f1424')
      if (!lit) return
      g.rect(wx + 1, wy + 1, 28, 13, C.wall); planks(g, wx + 1, wy + 14, 28, 19); desk(g, bits, wx + 4, wy + 32, name, st, t)
    })
    // The door at the street end of the building, its brass plaque over it and a lamp beside it.
    if (extra.door === 'open') { g.box(28, 62, 28, 30, '#5a4a2a'); g.rect(30, 64, 24, 26, '#3a3050'); g.rect(26, 62, 3, 30, C.ink); g.rect(55, 62, 3, 30, C.ink) } else { g.box(28, 62, 28, 30, C.door); g.rect(41, 64, 2, 26, C.ink); g.rect(36, 76, 3, 3, C.brass) }
    g.rect(31, 55, 22, 4, C.brass); g.rect(58, 58, 2, 2, C.brass)
    // The usage tanks on the lawn, as in the office's power plant: they fill as the page is built.
    const { level, tone } = tankLevel(extra.tanks ?? 0, 1)
    for (const [x, share] of [[224, 1], [232, 0.6]]) { g.box(x, 64, 7, 30, '#2a2e39'); const h = Math.round(26 * Math.min(1, level * share)); g.rect(x + 1, 93 - h, 5, h, tone); g.rect(x + 2, 62, 3, 2, C.ink) }
    if (!extra.quiet) walker(g, bits, 'courier', (beat(t, 90) % (g.w + 60)) - 30, 108, t, 'right')
  },
  // The workroom: two desks, one thinking and one running.
  workroom(g, bits, t) { g.rect(0, 0, g.w, 26, C.wall); g.rect(0, 25, g.w, 1, C.ink); planks(g, 0, 26, g.w, g.h - 26); shelf(g, 6, 6); desk(g, bits, 34, 56, 'bolt', 'thinking', t); desk(g, bits, 78, 56, 'cleo', 'running', t) },
  // The meeting table: the run track on the wall with one lit station that steps; two interns at laptops.
  meeting(g, bits, t) {
    g.rect(0, 0, g.w, 26, C.wall); g.rect(0, 25, g.w, 1, C.ink); planks(g, 0, 26, g.w, g.h - 26)
    const now = beat(t, 900) % 7
    for (let i = 0; i < 7; i++) g.box(18 + i * 13, 8, 9, 9, i < now ? C.green : i === now ? C.brass : '#1a1726')
    for (let i = 0; i < 6; i++) g.rect(27 + i * 13, 12, 4, 1, C.muted)
    character(g, bits, 'dex', 'front', 'sit', 28, 26); character(g, bits, 'eve', 'front', 'sit', 76, 26)
    g.box(18, 46, 84, 12, '#5a3a24'); g.box(30, 42, 10, 5, C.crt); g.box(78, 42, 10, 5, C.crt)
  },
  // The bookshelf: an agent reading, the page turning.
  shelf(g, bits, t) {
    g.rect(0, 0, g.w, 26, C.wall); g.rect(0, 25, g.w, 1, C.ink); planks(g, 0, 26, g.w, g.h - 26)
    for (let i = 0; i < 6; i++) shelf(g, 6 + i * 18, 4)
    character(g, bits, 'ada', 'side', 'stand', 50, 30); const open = beat(t, 700) % 2; g.box(60, 42, 8 + open, 6, C.paper)
  },
  // The loading dock: a courier brings the box in; boxes with a brass stripe wait by the door.
  dock(g, bits, t) {
    g.rect(0, 0, g.w, 30, C.wall); g.rect(0, 29, g.w, 1, C.ink); g.rect(0, 30, g.w, g.h - 30, '#3a3f4d'); for (let y = 32; y < g.h; y += 4) for (let x = 2; x < g.w; x += 4) g.set(x, y, '#444a5a')
    g.box(90, 8, 24, 22, C.door); g.rect(101, 9, 2, 20, C.ink)
    for (const [x, y] of [[8, 40], [20, 40], [14, 32]]) { g.box(x, y, 12, 9, C.desk); g.rect(x + 2, y + 4, 8, 1, C.brass) }
    walker(g, bits, 'finn', 40 + (beat(t, 160) % 40), 58, t, 'right')
  },
  // The reader at the foot of the docs menu: a desk, a book, and a page turned for every stretch you scroll.
  reader(g, bits, t, extra) {
    planks(g, 0, 10, g.w, g.h - 10)
    const read = Math.round((extra?.scroll ?? 0) * 6)
    desk(g, bits, 12, 38, 'cleo', 'idle', t, false)
    g.box(29, 27, 7 + read, 6, C.paper); g.rect(31 + read, 30, 1, 1, beat(t, 500) % 2 ? C.cyan : C.muted)
  }
}
const SIZES = { facade: [240, 120], workroom: [120, 60], meeting: [120, 60], shelf: [120, 60], dock: [120, 60], reader: [48, 40] }
export const SCENES = Object.keys(scenes)

export function scene(name, bits, t, extra) {
  const [w, h] = SIZES[name]
  const g = new Grid(w, h, C.night)
  scenes[name](g, bits, t, extra)
  return { w, h, px: g.px }
}

/** Draws every <canvas data-scene> in the document and keeps it alive at eight steps a second; under reduced motion one finished frame. */
export function mount(doc, bits) {
  const still = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const start = Date.now()
  const canvases = [...doc.querySelectorAll('canvas[data-scene]')].filter((c) => SIZES[c.dataset.scene])
  const paint = (c, t) => {
    const name = c.dataset.scene, [w, h] = SIZES[name]
    if (c.width !== w) (c.width = w), (c.height = h)
    const win = doc.defaultView, scroll = win ? win.scrollY / Math.max(1, doc.documentElement.scrollHeight - win.innerHeight) : 0
    const { px } = scene(name, bits, t, { scroll, ...c.sceneExtra })
    paintPixels(c, w, h, (x, y) => px[y][x])
  }
  const facade = doc.querySelector('.facade')
  if (facade) { const layer = doc.createElement('div'); layer.id = 'crew'; doc.body.append(layer); windows(doc, layer); if (!still) crew(doc, bits, layer) }
  if (still) return canvases.forEach((c) => paint(c, 60_000))
  // Every scene is drawn once, so none is blank; then only the ones on screen move.
  canvases.forEach((c) => paint(c, 0))
  const tick = () => { const t = Date.now() - start; for (const c of canvases) { const r = c.getBoundingClientRect(); if (r.bottom > 0 && r.top < doc.defaultView.innerHeight) paint(c, t) } }
  return doc.defaultView.setInterval(tick, 125)
}

/** Where the five windows and the door sit on the page, for a facade drawn in the rectangle `r`. */
export function windowRects(r) {
  const k = r.w / 240
  return STATES.map(([name, state], i) => ({ x: Math.round(r.x + (62 + i * 31) * k), y: Math.round(r.y + 36 * k), w: Math.round(30 * k), h: Math.round(34 * k), name, state }))
}
export const doorRect = (r) => { const k = r.w / 240; return { x: r.x + 28 * k, y: r.y + 62 * k, w: 28 * k, h: 30 * k } }
/** The part whose box is nearest to a point. */
export function nearestPart(parts, x, y) {
  let best = -1, d = Infinity
  parts.forEach((p, i) => { const dx = Math.max(p.x - x, 0, x - (p.x + p.w)), dy = Math.max(p.y - y, 0, y - (p.y + p.h)); const dd = dx * dx + dy * dy; if (dd < d) (d = dd), (best = i) })
  return best
}
/** How full the tanks are and in which colour: brass, amber past half, red near the end. */
export function tankLevel(done, total) { const level = total ? done / total : 0; return { level, tone: level >= 0.85 ? '#d83a3a' : level > 0.5 ? '#e0a030' : '#f2c230' } }

// ---- The crew: six engineers who build the home page part by part as it scrolls into view.
const ACTIONS = { text: 'type', box: 'hammer', pic: 'hang', scene: 'paint' }
export const actionFor = (kind) => ACTIONS[kind]
/** The next part to build: the first in page order not yet taken whose top is within reach; -1 when none is. */
export function nextPart(parts, reach, taken) {
  for (let i = 0; i < parts.length; i++) if (!taken.has(i) && parts[i].y <= reach) return i
  return -1
}
/** The arms drawn over a 16x24 body for a kind of work, frame a (0 or 1): [x, y, w, h, palette key]. The office's own gestures (character.ts). */
export function armPixels(kind, a) {
  if (kind === 'type') return [[1, 13 + a, 2, 3, 'c'], [13, 14 - a, 2, 3, 'c']]
  if (kind === 'hammer') return a ? [[13, 4, 2, 9, 'o'], [13, 5, 1, 7, 'c'], [13, 2, 2, 2, 's']] : [[13, 10, 2, 5, 'o'], [13, 11, 1, 3, 'c'], [14, 14, 2, 2, 's']]
  if (kind === 'brush') return [[13, 8 + a * 3, 3, 2, 'o'], [13, 9 + a * 3, 2, 1, 'c'], [15, 8 + a * 3, 2, 2, 's']]
  if (kind === 'wave') return [[13, 3 + a, 2, 10, 'o'], [13, 4 + a, 2, 8, 'c'], [12, a, 4, 4, 'o'], [13, 1 + a, 2, 2, 's']]
  return []
}
/** Who an engineer is on a section: itself when alone there, the intern of whoever is already working on it (who becomes the boss). */
export const castFor = (working, section) => (working.some((w) => w.section === section) ? 'intern' : 'senior')
const PART_SELECTORS = '.street h1, .lede, .street .row, .brew, .meta, .legend, .rules p, .room h2, .room p:not(.links), .room .steps li, .room .links, .room canvas, .room img, .lobby h2, .hub'
const kindOf = (el) => (el.tagName === 'CANVAS' ? 'scene' : el.tagName === 'IMG' ? 'pic' : /\b(row|links|hub|legend)\b/.test(el.className) ? 'box' : 'text')
// 12x12 tools, 'b' brass, 'k' ink, 'w' wood, 'p' paper, 'r' red, 'g' grey.
const TOOLS = {
  laptop: ['............', '..kkkkkkkk..', '..kggggggk..', '..kggggggk..', '..kggggggk..', '..kkkkkkkk..', '.kkkkkkkkkk.', '.kggggggggk.', '.kkkkkkkkkk.', '............', '............', '............'],
  hammer1: ['....kkkk....', '...kggggk...', '...kggggk...', '....kkkk....', '.....kw.....', '.....kw.....', '.....kw.....', '.....kw.....', '.....kw.....', '.....kw.....', '.....kk.....', '............'],
  hammer2: ['............', '............', '..kkkk......', '.kggggk.....', '.kggggkkk...', '..kkkkwwkk..', '......kkwwk.', '........kwk.', '.........kk.', '............', '............', '............'],
  tape: ['............', '...bbbbbb...', '..bbbbbbbb..', '..bbkkkkbb..', '..bbkppkbb..', '..bbkkkkbb..', '..bbbbbbbb..', '...bbbbbb...', '....kkkkkkkk', '............', '............', '............'],
  brush: ['.........ww.', '........wwk.', '.......wwk..', '......wwk...', '.....wwk....', '....kkk.....', '...kbbk.....', '..kbbbk.....', '..kbbk......', '..kkk.......', '............', '............'],
  parcel: ['............', '............', '............', '..kkkkkkkk..', '..kwwwwwwk..', '..kwwbbwwk..', '..kwwbbwwk..', '..kwwwwwwk..', '..kkkkkkkk..', '............', '............', '............'],
  none: []
}
const TOOL_PAL = { b: '#f2c230', k: '#08070c', w: '#c68e57', p: '#f6f6fa', g: '#a4a2b8' }

/** Puts a w x h picture on a canvas from a function giving each pixel's '#rrggbb', or nothing for clear. */
function paintPixels(canvas, w, h, at) {
  if (canvas.width !== w) (canvas.width = w), (canvas.height = h)
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const hex = at(x, y); if (!hex) continue; const i = (y * w + x) * 4; img.data[i] = parseInt(hex.slice(1, 3), 16); img.data[i + 1] = parseInt(hex.slice(3, 5), 16); img.data[i + 2] = parseInt(hex.slice(5, 7), 16); img.data[i + 3] = 255 }
  ctx.putImageData(img, 0, 0)
}
const paintRows = (canvas, rows, pal, w, h) => paintPixels(canvas, w, h, (x, y) => { const c = rows[y]?.[x]; return c && c !== '.' && pal[c] })

/** Hit areas over the facade's windows: a tag on hover, the state's screenshot on a click; they follow the facade when the layout moves. */
function windows(doc, layer) {
  const win = doc.defaultView, facade = doc.querySelector('.facade')
  const stage = () => { const r = facade.getBoundingClientRect(); return { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height } }
  const peeks = [...doc.querySelectorAll('.peek')]
  const closePeeks = () => peeks.forEach((f) => { f.classList.remove('open'); win.setTimeout(() => f.classList.contains('open') || (f.hidden = true), 260) })
  const place = (b, w) => (b.style.cssText = `left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px`)
  const wins = windowRects(stage()).map((w) => {
    const b = doc.createElement('button'); b.className = 'win'; b.type = 'button'; b.dataset.label = `${w.name} · ${w.state === 'permission' ? 'waiting for you' : w.state}`; b.setAttribute('aria-label', b.dataset.label)
    place(b, w); layer.append(b)
    b.onclick = (ev) => {
      ev.stopPropagation(); const r = windowRects(stage())[STATES.findIndex(([n]) => n === w.name)]
      const f = peeks.find((f) => f.dataset.state === w.state); const open = f.classList.contains('open'); closePeeks(); if (open) return
      f.hidden = false; f.style.left = `${Math.min(r.x, win.innerWidth - 16 - Math.min(560, win.innerWidth - 32))}px`
      const below = r.y + r.h + 8 + f.offsetHeight <= win.scrollY + win.innerHeight; f.classList.toggle('above', !below); f.style.top = below ? `${r.y + r.h + 8}px` : `${r.y - 8 - f.offsetHeight}px`
      win.requestAnimationFrame(() => f.classList.add('open'))
    }
    return b
  })
  const refit = () => windowRects(stage()).forEach((w, i) => place(wins[i], w))
  win.addEventListener('resize', refit); doc.fonts?.ready.then(refit)
  doc.addEventListener('click', closePeeks)
  doc.addEventListener('keydown', (ev) => ev.key === 'Escape' && peeks.some((f) => f.classList.contains('open')) && closePeeks())
  return { peeks, closePeeks }
}

/** Starts the crew on the home page: returns nothing when the page is not being built (reduced motion, or no parts). */
export function crew(doc, bits, layer) {
  const win = doc.defaultView, html = doc.documentElement
  if (!html.classList.contains('building')) return
  const parts = [...doc.querySelectorAll(PART_SELECTORS)].map((el) => ({ el, kind: kindOf(el), y: 0 }))
  if (!parts.length) return (html.classList.remove('building'), undefined)
  parts.forEach((p) => p.el.classList.add('part'))
  const bar = doc.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<b>Building the page</b><span data-who></span><i></i><button data-replay>Replay</button><button data-skip>Skip</button><button data-speed>1×</button>'; doc.body.append(bar)
  const who = bar.querySelector('[data-who]'), meter = bar.querySelector('i')
  const STOP = {}
  let session = 0, speed = 1, taken = new Set(), done = 0, busy = 0
  const working = []
  const pageY = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + win.scrollX, y: r.top + win.scrollY, w: r.width, h: r.height } }
  const sleep = (ms) => { const s = session; return new Promise((r) => win.setTimeout(r, ms / speed)).then(() => { if (s !== session) throw STOP }) }
  const frame = () => { const s = session; return new Promise((r) => win.requestAnimationFrame(r)).then(() => { if (s !== session) throw STOP }) }
  const status = () => { setScene({ tanks: parts.length ? done / parts.length : 0 }); parts.forEach((p) => Object.assign(p, pageY(p.el))); who.textContent = done === parts.length ? `built · ${parts.length} parts` : `${busy} of ${CREW.length} at work · ${done} of ${parts.length} parts`; meter.style.setProperty('--p', `${(done / parts.length) * 100}%`) }

  const facade = doc.querySelector('.facade'), stage = () => pageY(facade)
  const setScene = (x) => (facade.sceneExtra = { ...facade.sceneExtra, ...x })
  setScene({ door: 'closed', tanks: 0 })
  const { peeks, closePeeks } = windows(doc, layer)
  const makeEngineer = (name, i) => {
    const el = doc.createElement('div'); el.className = 'eng'
    const body = doc.createElement('canvas'), tool = doc.createElement('canvas'); tool.className = 'tool'
    const tag = doc.createElement('span'); tag.className = 'tag'; tag.textContent = name
    const say = doc.createElement('span'); say.className = 'say'
    el.append(body, tool, say, tag); layer.append(el)
    const e = { name, i, el, body, tool, say, x: -80, y: 0, view: 'front', pose: 'stand', flip: false, role: 'senior', arms: 'none', a: 0, section: null }
    e.show = (view, pose, flip = false, arms = e.arms, a = e.a) => {
      if (e.view === view && e.pose === pose && e.flip === flip && e.role === e.drawnRole && e.arms === arms && e.a === a && e.drawn) return
      e.view = view; e.pose = pose; e.flip = flip; e.arms = arms; e.a = a; e.drawn = true; e.drawnRole = e.role
      const ch = bits.CHARS[name][e.role === 'senior' ? 'own' : e.role]
      paintRows(body, ch[view][pose], ch.pal, 16, 24)
      const ctx = body.getContext('2d')
      for (const [x, y, w, h, c] of armPixels(arms, a)) { ctx.fillStyle = ch.pal[c]; ctx.fillRect(x, y, w, h) }
      body.classList.toggle('flip', flip)
    }
    e.hold = (t) => { paintRows(tool, TOOLS[t], TOOL_PAL, 12, 12); tool.style.visibility = t === 'none' ? 'hidden' : '' }
    e.alert = (on) => say.classList.toggle('alert', on)
    e.put = (x, y) => { e.x = x; e.y = y; el.style.transform = `translate(${x}px,${y}px)` }
    e.show('front', 'stand'); e.hold('none'); e.put(-80, 0); el.style.visibility = 'hidden'
    if (i < CREW.length) el.onclick = (ev) => { ev.stopPropagation(); if (!e.busyNow) e.redo = nearestPart(parts, e.x + 24, e.y + 72) }
    return e
  }
  const engineers = CREW.map(makeEngineer)

  async function walk(e, x, y, fast = 1) {
    const x0 = e.x, y0 = e.y, d = Math.hypot(x - x0, y - y0), ms = Math.max(120, (d * 2.2) / fast) / speed, t0 = win.performance.now()
    const flip = x < x0
    for (;;) {
      await frame()
      const t = Math.min(1, (win.performance.now() - t0) / ms)
      e.put(x0 + (x - x0) * t, y0 + (y - y0) * t)
      e.show('side', Math.floor(win.performance.now() / 130) % 2 ? 'walk1' : 'walk2', flip, 'none', 0)
      if (t >= 1) break
    }
    e.show('front', 'stand', false, 'none', 0)
  }
  // Beside the part: to its left when there is room, else to its right, else above it (a narrow screen).
  const standBy = (e, r) => (r.x >= 76 ? walk(e, r.x - 72, r.y + r.h - 72) : r.x + r.w + 60 <= win.innerWidth ? walk(e, r.x + r.w + 8, r.y + r.h - 72) : walk(e, r.x, r.y - 76))
  const ghostAt = (r, cls = 'ghost') => { const g = doc.createElement('div'); g.className = cls; g.style.cssText = `left:${r.x}px;top:${r.y}px;width:0;height:0`; layer.append(g); return g }

  // Text: the engineer sits at a laptop beside it and the words come out with a caret, inline markup kept.
  async function type(e, p) {
    const r = pageY(p.el); await standBy(e, r); e.show('front', 'sit'); e.hold('laptop'); e.say.textContent = 'typing'
    const walker = doc.createTreeWalker(p.el, 4), nodes = []
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push([n, n.data])
    nodes.forEach(([n]) => (n.data = '')); p.el.classList.add('typing')
    const caret = doc.createElement('i'); caret.className = 'caret'
    const total = nodes.reduce((a, [, d]) => a + d.length, 0), per = Math.max(4, Math.min(40, 1800 / Math.max(1, total))), chunk = per < 10 ? 3 : per < 16 ? 2 : 1
    try {
      for (const [n, text] of nodes) {
        n.parentNode.insertBefore(caret, n.nextSibling)
        for (let i = chunk; i < text.length + chunk; i += chunk) { n.data = text.slice(0, Math.min(i, text.length)); e.show('front', 'sit', false, 'type', (i / chunk) % 2); await sleep(per * chunk) }
      }
    } finally { nodes.forEach(([n, d]) => (n.data = d)); caret.remove(); p.el.classList.remove('typing'); e.hold('none'); e.show('front', 'stand', false, 'none', 0) }
  }
  // A box: the frame grows nail by nail under the hammer, with its size on it.
  async function hammer(e, p) {
    const r = pageY(p.el); await walk(e, Math.max(0, r.x - 40), r.y - 60); e.say.textContent = 'hammering'
    const g = ghostAt(r), size = doc.createElement('span'); size.className = 'size'; const fill = doc.createElement('span'); fill.className = 'fill'; g.append(fill, size)
    const blows = 8
    try {
      for (let i = 1; i <= blows; i++) {
        e.hold(i % 2 ? 'hammer1' : 'hammer2'); e.show('front', 'stand', false, 'hammer', i % 2)
        fill.style.width = `${(i / blows) * 100}%`
        const f = i / blows, w = Math.round(r.w * Math.min(1, f * 2)), h = Math.round(r.h * Math.max(0, f * 2 - 1))
        g.style.width = `${w}px`; g.style.height = `${Math.max(2, h)}px`; size.textContent = `${w} × ${Math.max(0, h)}`
        if (i === 2 || i === 4 || i === 6 || i === 8) { const n = doc.createElement('b'); n.className = 'nail'; n.style.cssText = `left:${i <= 4 ? w - 4 : 0}px;top:${i >= 6 ? h - 4 : -2}px`; g.append(n) }
        await sleep(110)
      }
      await sleep(120)
    } finally { g.remove(); e.hold('none'); e.show('front', 'stand', false, 'none', 0) }
  }
  // A picture: the spot is measured with a tape, then the picture is carried in from the page's edge and hung.
  async function hang(e, p) {
    const r = pageY(p.el); await walk(e, Math.max(0, r.x - 56), r.y - 72); e.hold('tape'); e.say.textContent = 'measuring'
    const tape = doc.createElement('div'); tape.className = 'tape'; tape.style.cssText = `left:${r.x}px;top:${r.y - 8}px;width:0`; const size = doc.createElement('span'); size.className = 'size'; tape.append(size); layer.append(tape)
    try {
      for (let i = 1; i <= 10; i++) { tape.style.width = `${(r.w * i) / 10}px`; size.textContent = `${Math.round((r.w * i) / 10)} × ${Math.round(r.h)}`; await sleep(60) }
      await sleep(200); tape.remove(); e.hold('none'); e.say.textContent = 'carrying'
      const from = -(r.x + r.w + 60), steps = 16
      p.el.style.transform = `translateX(${from}px)`; p.el.classList.add('in')
      for (let i = 1; i <= steps; i++) { const x = from * (1 - i / steps); p.el.style.transform = `translateX(${x}px)`; e.put(r.x + x - 50, r.y + Math.min(r.h, 72) - 72); e.show('side', i % 2 ? 'walk1' : 'walk2'); await sleep(55) }
      p.el.style.transform = 'rotate(-1.5deg)'; e.say.textContent = 'straightening'; e.hold('hammer1'); e.show('front', 'stand', false, 'hammer', 1); await sleep(260); e.hold('hammer2'); e.show('front', 'stand', false, 'hammer', 0); p.el.style.transform = ''; await sleep(200)
    } finally { tape.remove(); p.el.style.transform = ''; e.hold('none'); e.show('front', 'stand', false, 'none', 0) }
  }
  // A scene: painted in bands from the top, the brush moving down the left edge.
  async function paint(e, p) {
    const r = pageY(p.el); await walk(e, Math.max(0, r.x - 56), r.y); e.hold('brush'); e.say.textContent = 'painting'
    const bands = 10; p.el.classList.add('in')
    try {
      for (let i = 1; i <= bands; i++) { p.el.style.clipPath = `inset(0 0 ${100 - (i / bands) * 100}% 0)`; e.put(e.x, r.y + Math.min(r.h - 72, (r.h * i) / bands)); e.show('front', 'stand', false, 'brush', i % 2); await sleep(90) }
    } finally { p.el.style.clipPath = ''; e.hold('none'); e.show('front', 'stand', false, 'none', 0) }
  }
  const work = { type, hammer, hang, paint }

  // Nothing to do: the engineer walks off the left edge and waits there, out of the page's way, and comes back in for the next part.
  async function idle(e) {
    e.say.textContent = ''
    const d = doorRect(stage()), onScreen = d.y + d.h > win.scrollY && d.y < win.scrollY + win.innerHeight
    if (onScreen) await walk(e, d.x + d.w + 20 + e.i * 44, d.y + d.h - 72)
    else await walk(e, -70, win.scrollY + win.innerHeight - 130 - e.i * 6)
    await sleep(500 + Math.random() * 700)
  }
  // The opening: the lights are on, the door opens, and each engineer steps out of it.
  async function enter(e) {
    await sleep(3200 + e.i * 380); setScene({ door: 'open' })
    const d = doorRect(stage()); e.put(d.x + d.w / 2 - 24, d.y + d.h - 72); e.el.style.visibility = ''
    await walk(e, d.x + d.w + 20 + e.i * 44, d.y + d.h - 72)
  }
  // The ending: everyone walks back in, the courier brings the dmg to the Download button, and the door closes on a lit office.
  let ended = false
  async function finish() {
    if (ended) return; ended = true
    const d = doorRect(stage()), out = engineers.map((e) => e.busyNow)
    for (const e of engineers) if (!out[e.i]) walk(e, d.x + d.w / 2 - 24, d.y + d.h - 72).then(() => (e.el.style.visibility = 'hidden')).catch(() => {})
    await sleep(1800)
    const btn = doc.querySelector('.street .row .btn'); if (!btn) return
    const c = courier(); setScene({ quiet: true }); c.put(d.x + d.w / 2 - 24, d.y + d.h - 72); c.el.style.visibility = ''; c.hold('parcel')
    const r = pageY(btn); await walk(c, r.x + r.w / 2 - 24, r.y - 76, 4)
    const tag = doc.createElement('span'); tag.className = 'parcel'; tag.textContent = 'Agent-World-arm64.dmg'; btn.append(tag); c.hold('none'); await sleep(900)
    await walk(c, d.x + d.w / 2 - 24, d.y + d.h - 72, 4); c.el.style.visibility = 'hidden'; setScene({ door: 'closed', quiet: false })
  }
  let theCourier = null
  const courier = () => theCourier ?? (theCourier = makeEngineer('courier', CREW.length))
  async function loop(e) {
    try {
      await enter(e)
      for (;;) {
        passed()
        if (e.redo != null) { const j = e.redo; e.redo = null; const p = parts[j]; e.busyNow = true; p.el.classList.remove('in'); try { await work[actionFor(p.kind)](e, p) } finally { p.el.classList.add('in'); e.busyNow = false; e.say.textContent = '' } continue }
        const i = nextPart(parts, win.scrollY + win.innerHeight * 1.15, taken)
        if (i < 0) { if (done >= parts.length) { finish().catch((err) => err !== STOP && console.error(err)); return } await idle(e); continue }
        taken.add(i); busy++; status()
        const p = parts[i], section = p.el.closest('section')
        // A box is nailed up only once its section's words are in: until then the engineer waits for them, as an agent waits for you.
        const run = session
        e.role = castFor(working, section); if (e.role === 'intern') for (const w of working) if (w.section === section) { w.e.role = 'boss'; w.e.drawn = false; w.e.show(w.e.view, w.e.pose, w.e.flip) }
        working.push({ section, name: e.name, e }); e.drawn = false; e.busyNow = true
        try {
          if (p.kind === 'box') {
            const r = pageY(p.el); await walk(e, Math.max(0, r.x - 40), r.y - 60)
            let waved = 0
            while (parts.some((q, j) => j < i && q.kind === 'text' && q.el.closest('section') === section && !q.el.classList.contains('in'))) { e.alert(true); e.say.textContent = '!'; e.show('front', 'stand', false, 'wave', waved++ % 2); await sleep(260) }
            e.alert(false); e.say.textContent = ''
          }
          await work[actionFor(p.kind)](e, p); p.el.classList.add('in')
        } finally { if (run === session) { busy--; done++; status() } e.say.textContent = ''; e.alert(false); e.busyNow = false; if (run === session) working.splice(working.findIndex((w) => w.name === e.name), 1); e.role = 'senior'; e.drawn = false; e.show(e.view, e.pose, e.flip, 'none', 0) }
        if (done >= parts.length) html.classList.remove('building')
      }
    } catch (err) { if (err !== STOP) { console.error(err); skip() } }
  }
  // A part scrolled past before anyone got to it is simply there: nobody is watching it being built.
  const passed = () => { parts.forEach((p, j) => { Object.assign(p, pageY(p.el)); if (!taken.has(j) && p.y + p.el.offsetHeight < win.scrollY - 40) { taken.add(j); p.el.classList.add('in'); done++ } }); status(); if (done >= parts.length) html.classList.remove('building') }
  win.addEventListener('scroll', () => session && passed(), { passive: true })
  const start = () => { session++; taken = new Set(); done = 0; busy = 0; working.length = 0; status(); engineers.forEach((e) => loop(e)) }
  const skip = () => { session++; taken = new Set(parts.map((_, i) => i)); done = parts.length; busy = 0; parts.forEach((p) => { p.el.classList.add('in'); p.el.style.transform = ''; p.el.style.clipPath = '' }); layer.querySelectorAll('.ghost, .tape').forEach((g) => g.remove()); engineers.forEach((e) => { e.hold('none'); e.say.textContent = ''; e.show('front', 'stand'); e.busyNow = false; e.el.style.visibility = 'hidden' }); html.classList.remove('building'); setScene({ door: 'closed', quiet: false }); status() }
  const replay = () => { ended = false; doc.querySelectorAll('.btn .parcel').forEach((t) => t.remove()); if (theCourier) theCourier.el.style.visibility = 'hidden'; parts.forEach((p) => { p.el.classList.remove('in'); p.el.style.transform = ''; p.el.style.clipPath = '' }); html.classList.add('building'); win.scrollTo({ top: 0, behavior: 'instant' }); setScene({ door: 'closed', quiet: false, tanks: 0 }); start() }
  bar.querySelector('[data-skip]').onclick = skip
  bar.querySelector('[data-replay]').onclick = replay
  bar.querySelector('[data-speed]').onclick = (ev) => { speed = speed === 1 ? 2 : 1; ev.target.textContent = `${speed}×` }
  doc.addEventListener('keydown', (ev) => ev.key === 'Escape' && !peeks.some((f) => f.classList.contains('open')) && skip())
  win.awCrew = true
  start()
}
