import { type View, bodyPixels, clean, pixelTexture } from './sprites'

export type StaffKind = 'boy' | 'supervisor' | 'courier' | 'pizza' | 'guard'
/** reach: an arm straight up to a shelf · clasp: both hands behind the back · sip: a cup at the mouth · call: a hand at the ear · chin: a hand on the chin · hold: both hands in front, with a book, a can or a tray in them · wipe: an arm out in front, with a cloth or a broom */
export type StaffPose = 'stand' | 'walk1' | 'walk2' | 'salute' | 'point' | 'wipe' | 'sip' | 'call' | 'chin' | 'hold' | 'reach' | 'clasp' | 'reach' | 'clasp'

// 16x24, like the agents. Keys: o outline · h hair · s/S skin · e eye · c/C clothes · p trousers · k shoes · r/R gamcha · b belt · y lanyard · l badge
const KEYS: Record<StaffKind, Record<string, number>> = {
  boy: { o: 0x1a1522, h: 0x2b1d14, H: 0x1a120c, s: 0xe0ac7e, S: 0xc08a5e, e: 0x1a1522, c: 0xc9ad6e, C: 0xa68c52, a: 0xc9ad6e, p: 0x8f7a48, k: 0x3a2a22, r: 0xc8303e, R: 0x8e2030, w: 0xf4f4f8 },
  courier: { o: 0x1a1522, h: 0x2b1d14, H: 0x1a120c, s: 0xe0b08a, S: 0xc08a5e, e: 0x1a1522, c: 0xd8782a, C: 0xb05a1c, a: 0xd8782a, p: 0x3a3a4a, k: 0x2a2024, r: 0xd8782a, R: 0xb05a1c, w: 0xf4f4f8 },
  pizza: { o: 0x1a1522, h: 0x2b1d14, H: 0x1a120c, s: 0xf0c49c, S: 0xc8946a, e: 0x1a1522, c: 0xc8302e, C: 0x9a2024, a: 0xc8302e, p: 0x2a2a38, k: 0x2a2024, r: 0xc8302e, R: 0x9a2024, w: 0xf4f4f8 },
  guard: { o: 0x1a1522, h: 0x2b1d14, H: 0x1a120c, s: 0xc89870, S: 0xa87850, e: 0x1a1522, c: 0x4a5a7a, C: 0x36435e, a: 0x4a5a7a, p: 0x2a3248, k: 0x14111c, r: 0x36435e, R: 0x222a40, b: 0x14111c, y: 0xd8a030, l: 0xd8a030, w: 0xf4f4f8 },
  supervisor: { o: 0x1a1522, h: 0x5a3825, H: 0x3d2618, s: 0xf5d0a9, S: 0xd8ae88, e: 0x1a1522, c: 0x8fb4d8, C: 0x6f94b8, a: 0x8fb4d8, p: 0x5a5f6a, k: 0x2a2024, b: 0x2a2024, y: 0xd8a030, l: 0xf4f4f8, w: 0xf4f4f8 }
}

type Rows = string[]
const put = (rows: Rows, x: number, y: number, ch: string) => {
  const r = rows[y]
  if (r && x >= 0 && x < r.length) rows[y] = r.slice(0, x) + ch + r.slice(x + 1)
}
const span = (rows: Rows, x0: number, x1: number, y: number, ch: string) => {
  for (let x = x0; x <= x1; x++) put(rows, x, y, ch)
}
/** An arm drawn as a line of pixels from the shoulder to the hand: sleeve for most of the way, then the skin of the hand. */
function arm(rows: Rows, from: Pt, to: Pt, sleeve = 'c') {
  const n = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y))
  for (let i = 0; i <= n; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / Math.max(1, n))
    const y = Math.round(from.y + ((to.y - from.y) * i) / Math.max(1, n))
    put(rows, x, y, i >= n - 1 ? 's' : sleeve)
  }
}
interface Pt {
  x: number
  y: number
}

/** Where the hand is for each pose that lifts it, from the front and the side (facing right): the arm is drawn from the shoulder to there. */
const HANDS: Partial<Record<StaffPose, { front: Pt[]; side: Pt[] }>> = {
  sip: { front: [{ x: 5, y: 10 }], side: [{ x: 10, y: 10 }] },
  call: { front: [{ x: 4, y: 8 }], side: [{ x: 8, y: 8 }] },
  chin: { front: [{ x: 6, y: 11 }], side: [{ x: 10, y: 11 }] },
  hold: { front: [{ x: 5, y: 16 }, { x: 10, y: 16 }], side: [{ x: 11, y: 16 }] }
}
const SHOULDERS = { front: [{ x: 3, y: 13 }, { x: 12, y: 13 }], side: [{ x: 7, y: 13 }] }

/** Clears the hanging arms (front) and draws the ones the pose lifts. The back view keeps its hanging arms. */
function raise(rows: Rows, view: View, pose: StaffPose) {
  if (pose === 'reach') {
    // One arm straight up above the head, to a shelf: on the viewer's right from the front and the back, forward from the side.
    const side = view === 'side'
    if (!side) for (let y = 13; y <= 17; y++) (put(rows, 12, y, '.'), put(rows, 13, y, '.'))
    arm(rows, side ? { x: 7, y: 13 } : { x: 12, y: 13 }, side ? { x: 10, y: 1 } : { x: 12, y: 0 })
    return
  }
  if (pose === 'clasp') {
    // Hands behind the back: from the front only the elbows stick out; from behind the clasped hands show low on the back.
    if (view === 'front') {
      for (let y = 13; y <= 17; y++) (put(rows, 2, y, '.'), put(rows, 3, y, '.'), put(rows, 4, y, '.'), put(rows, 11, y, '.'), put(rows, 12, y, '.'), put(rows, 13, y, '.'))
      put(rows, 2, 15, 'o')
      put(rows, 3, 14, 'c')
      put(rows, 3, 15, 'c')
      put(rows, 13, 15, 'o')
      put(rows, 12, 14, 'c')
      put(rows, 12, 15, 'c')
    } else if (view === 'back') {
      for (let y = 13; y <= 17; y++) (put(rows, 3, y, '.'), put(rows, 12, y, '.'))
      arm(rows, { x: 4, y: 13 }, { x: 7, y: 17 })
      arm(rows, { x: 11, y: 13 }, { x: 8, y: 17 })
    }
    return
  }
  const hands = HANDS[pose]
  if (!hands || view === 'back') return
  const which = view === 'side' ? 'side' : 'front'
  if (which === 'front') for (let y = 13; y <= 17; y++) (put(rows, 3, y, '.'), put(rows, 12, y, '.'), put(rows, 2, y, '.'), put(rows, 13, y, '.'))
  hands[which].forEach((h, i) => arm(rows, SHOULDERS[which][i] ?? SHOULDERS[which][0]!, h))
}

/** Where a held thing is drawn for a pose, in the sprite's own pixels facing front or right, so the actor can put it in the hand. */
export const HAND_AT: Record<'sip' | 'call' | 'chin' | 'hold' | 'wipe', { front: Pt; side: Pt }> = {
  sip: { front: { x: 4, y: 8 }, side: { x: 10, y: 8 } },
  call: { front: { x: 2, y: 6 }, side: { x: 7, y: 6 } },
  chin: { front: { x: 6, y: 11 }, side: { x: 10, y: 11 } },
  hold: { front: { x: 5, y: 14 }, side: { x: 11, y: 14 } },
  wipe: { front: { x: 13, y: 12 }, side: { x: 13, y: 12 } }
}

const replace = (rows: Rows, top: number, layer: Rows) => layer.forEach((line, i) => (rows[top + i] = line))

// ---- Supervisor: thin arms and legs under a round belly, a bald crown with patches of hair at the sides ----------------------------

const SUP_FRONT_TOP: Rows = [
  '.....occcco.....',
  '...osocyycoso...',
  '...osocllcoso...',
  '..osoccccccoso..',
  '.osoccccccccoso.',
  '.osoccccCcccoso.',
  '...obbbbbbbbo...'
]
const SUP_FRONT_LEGS: Record<'stand' | 'walk1' | 'walk2', Rows> = {
  stand: ['.....opoopo.....', '.....opoopo.....', '.....opoopo.....', '....okkookko....', '....oooooooo....'],
  walk1: ['.....opoopo.....', '.....opoopo.....', '.....okoopo.....', '....okko.opo....', '....oooo.okko...'],
  walk2: ['.....opoopo.....', '.....opoopo.....', '.....opoook.....', '....opo.okko....', '...okko.oooo....']
}

const SUP_SIDE_TOP: Rows = [
  '....occco.......',
  '....occcco......',
  '....ocsccco.....',
  '....occcccco....',
  '....occccccco...',
  '....occccccco...',
  '....obbbbbbo....'
]
const SUP_SIDE_LEGS: Record<'stand' | 'walk1' | 'walk2', Rows> = {
  stand: ['.....opo.......', '.....opo.......', '.....opo.......', '....okkko......', '....ooooo......'].map((r) => r.padEnd(16, '.')),
  walk1: ['.....opo.......', '....opo........', '...opo.opo.....', '...oko.okko....', '...ooo.ooooo...'].map((r) => r.padEnd(16, '.')),
  walk2: ['.....opo.......', '.....opo.......', '.....opo.......', '....okkko......', '....ooooo......'].map((r) => r.padEnd(16, '.'))
}

function supervisor(view: View, pose: StaffPose): Rows {
  const rows = bodyPixels('bald-crown', view, 'stand')
  const side = view === 'side'
  if (view === 'back') {
    // From behind: the crown is bare, the hair only a fringe round the ears.
    for (let y = 1; y <= 4; y++) rows[y] = rows[y]!.replace(/[hH]/g, 's')
    put(rows, 7, 2, 'H')
    put(rows, 9, 3, 'H')
  } else {
    // Bare crown: skin where the hair was, a few strands left on top and tufts above the ears.
    rows[0] = '................'
    rows[1] = side ? '.....ooooo......' : '.....oooooo.....'
    for (let y = 2; y <= 5; y++) rows[y] = rows[y]!.replace(/[hH]/g, 's')
    put(rows, 7, 2, 'H')
    put(rows, side ? 6 : 9, 2, 'H')
    put(rows, side ? 5 : 8, 3, 'H')
    put(rows, side ? 3 : 3, 5, 'h')
    put(rows, side ? 3 : 3, 6, 'h')
    if (!side) {
      put(rows, 12, 5, 'h')
      put(rows, 12, 6, 'h')
    }
  }
  const walk = pose === 'walk1' || pose === 'walk2' ? pose : 'stand'
  replace(rows, 12, side ? SUP_SIDE_TOP : SUP_FRONT_TOP)
  replace(rows, 19, side ? SUP_SIDE_LEGS[walk] : SUP_FRONT_LEGS[walk])
  raise(rows, view, pose)
  if (pose === 'point') {
    // One arm straight out in front of him, a finger at the end.
    if (side) {
      span(rows, 9, 14, 14, 's')
      put(rows, 15, 14, 's')
    } else {
      span(rows, 11, 15, 14, 's')
    }
  }
  return clean(rows)
}

// ---- Office boy: an ordinary body in khaki, a red gamcha over the shoulder, and a salute ---------------------------------------

function boy(view: View, pose: StaffPose): Rows {
  const walk = pose === 'walk1' || pose === 'walk2' ? pose : 'stand'
  const rows = bodyPixels('staff-boy', view, walk)
  const side = view === 'side'
  // The gamcha: a red cloth over one shoulder, hanging down the chest to the hip.
  if (view !== 'back') {
    const from = side ? 6 : 4
    for (let i = 0; i < 6; i++) {
      put(rows, from + i, 12 + i, 'r')
      put(rows, from + i + 1, 12 + i, side ? 'r' : 'R')
    }
    put(rows, from + 6, 18, 'R')
    put(rows, from + 6, 19, 'R')
  } else {
    span(rows, 5, 10, 12, 'r')
    span(rows, 5, 10, 13, 'R')
  }
  if (pose === 'salute') salute(rows, view)
  raise(rows, view, pose)
  if (pose === 'wipe' && view === 'side') {
    // The arm out in front, holding the cloth (drawn by the actor) against the counter.
    span(rows, 9, 10, 14, 'c')
    span(rows, 11, 12, 14, 's')
  }
  return clean(rows)
}

/** A police salute: the right hand flat to the brow, the elbow out and level with the shoulder, the other arm straight down. */
function salute(rows: Rows, view: View) {
  if (view === 'side') {
    // Facing right: the upper arm goes forward, the forearm up in front of the face, the palm flat on the brow.
    span(rows, 9, 11, 13, 'c')
    span(rows, 11, 12, 12, 'c')
    put(rows, 12, 11, 's')
    put(rows, 12, 10, 's')
    put(rows, 12, 9, 's')
    span(rows, 11, 13, 7, 's')
    span(rows, 11, 13, 6, 'o')
    put(rows, 14, 7, 'o')
    return
  }
  if (view === 'back') {
    // From behind: the right arm, on the viewer's right, goes out and up, and the hand lies on the brow beyond the head.
    for (let y = 13; y <= 17; y++) span(rows, 11, 13, y, '.')
    span(rows, 12, 14, 13, 'c')
    span(rows, 13, 14, 12, 'c')
    put(rows, 15, 12, 'o')
    span(rows, 13, 14, 11, 's')
    span(rows, 13, 14, 10, 's')
    span(rows, 12, 13, 9, 's')
    span(rows, 12, 13, 8, 's')
    span(rows, 11, 13, 7, 's')
    span(rows, 11, 14, 6, 'o')
    put(rows, 14, 7, 'o')
    return
  }
  // Front: the arm on the viewer's left goes out at the shoulder, up along the face, and the hand lies flat on the brow.
  for (let y = 13; y <= 17; y++) span(rows, 2, 4, y, '.')
  span(rows, 1, 3, 13, 'c')
  span(rows, 1, 2, 12, 'c')
  put(rows, 0, 12, 'o')
  span(rows, 1, 2, 11, 's')
  span(rows, 1, 2, 10, 's')
  span(rows, 2, 3, 9, 's')
  span(rows, 3, 6, 6, 's')
  span(rows, 3, 6, 5, 'o')
  put(rows, 2, 6, 'o')
}

// ---- Visitors: the same body as the office boy in their own clothes, with a cap over the hair ---------------------------------------

function visitor(kind: 'courier' | 'pizza' | 'guard', view: View, pose: StaffPose): Rows {
  const walk = pose === 'walk1' || pose === 'walk2' ? pose : 'stand'
  const rows = bodyPixels('staff-boy', view, walk)
  // The cap: the hair rows, and a peak over the brow, in the uniform's colour.
  for (let y = 0; y <= 3; y++) rows[y] = rows[y]!.replace(/h/g, 'r').replace(/H/g, 'R')
  if (view === 'front') put(rows, 7, 4, 'R'), put(rows, 8, 4, 'R')
  if (kind === 'guard' && view !== 'back') span(rows, 4, 11, 17, 'b'), put(rows, view === 'side' ? 9 : 5, 14, 'l')
  if (kind === 'guard' && pose === 'salute') salute(rows, view)
  raise(rows, view, pose)
  return clean(rows)
}

export function staffPixels(kind: StaffKind, view: View, pose: StaffPose): Rows {
  return kind === 'boy' ? boy(view, pose) : kind === 'supervisor' ? supervisor(view, pose) : visitor(kind, view, pose)
}

export const staffTexture = (kind: StaffKind, view: View, pose: StaffPose) => pixelTexture(staffPixels(kind, view, pose), KEYS[kind]!, `staff/${kind}/${view}/${pose}`)
export const STAFF_KEYS = KEYS
