import { type View, bodyPixels, clean, pixelTexture } from './sprites'

export type StaffKind = 'boy' | 'supervisor'
export type StaffPose = 'stand' | 'walk1' | 'walk2' | 'salute' | 'point' | 'wipe'

// 16x24, like the agents. Keys: o outline · h hair · s/S skin · e eye · c/C clothes · p trousers · k shoes · r/R gamcha · b belt · y lanyard · l badge
const KEYS: Record<StaffKind, Record<string, number>> = {
  boy: { o: 0x1a1522, h: 0x2b1d14, H: 0x1a120c, s: 0xe0ac7e, S: 0xc08a5e, e: 0x1a1522, c: 0xc9ad6e, C: 0xa68c52, a: 0xc9ad6e, p: 0x8f7a48, k: 0x3a2a22, r: 0xc8303e, R: 0x8e2030, w: 0xf4f4f8 },
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

export function staffPixels(kind: StaffKind, view: View, pose: StaffPose): Rows {
  return kind === 'boy' ? boy(view, pose) : supervisor(view, pose)
}

export const staffTexture = (kind: StaffKind, view: View, pose: StaffPose) => pixelTexture(staffPixels(kind, view, pose), KEYS[kind]!, `staff/${kind}/${view}/${pose}`)
export const STAFF_KEYS = KEYS
