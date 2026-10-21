import { pixelTexture } from './sprites'

// The office cat and the pigeon, as pixel tables like the agents'. Keys: o outline · f fur · F stripe · w white · e eye · n nose · b beak · g grey · G dark grey · p pink foot

export type CatPose = 'sleep' | 'sleep2' | 'sit' | 'walk1' | 'walk2'
export type BirdPose = 'perch' | 'fly1' | 'fly2' | 'tiny'

export const CAT_KEYS: Record<string, number> = { o: 0x1a1522, f: 0xd89a58, F: 0xa8662c, w: 0xf4ecdc, e: 0x3a8a4a, n: 0xe89aa0 }
export const BIRD_KEYS: Record<string, number> = { o: 0x1a1522, g: 0x9aa0b4, G: 0x6a7088, w: 0xe4e6f0, b: 0xe8a838, p: 0xe88a8a, e: 0xe8602a, v: 0x5aa88a }

const pad = (rows: string[], w = 16) => rows.map((r) => r.padEnd(w, '.'))

/** The cat, facing right. 16 wide, 10 tall. The sleeping one is a loaf with its nose under its tail; the second sleeping frame breathes. */
export const CAT: Record<CatPose, string[]> = {
  sleep: pad([
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '...ooffFfffoo...',
    '..offFffffFffo..',
    '.offfffffwwwefo.',
    '.ofwwoooooooooo.',
    '..oooo..........'
  ]),
  sleep2: pad([
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '...ooffFfffoo...',
    '..offFffffFffo..',
    '.offfffffwwwefo.',
    '.ofwwoooooooooo.'
  ]),
  sit: pad([
    '.........o.o....',
    '........ofoffo..',
    '........offffo..',
    '........ofeefo..',
    '........offnfo..',
    '.......oofffoo..',
    '......offFfffo..',
    '.....offfFfffo..',
    '.....offfffwwo..',
    '......ooooooo...'
  ]),
  walk1: pad([
    '................',
    '..o.........o.o.',
    '..o........ofofo',
    '..fo.......offfo',
    '..ffo....ooffeno',
    '...offfooffffffo',
    '...offFfFfffffo.',
    '...ofo.ofo.ofo..',
    '...oo..oo..oo...',
    '................'
  ]),
  walk2: pad([
    '................',
    '................',
    '..o.........o.o.',
    '..fo.......ofofo',
    '..ffo....ooffeno',
    '...offfooffffffo',
    '...offFfFfffffo.',
    '....ofo.ofo.ofo.',
    '....oo...oo..oo.',
    '................'
  ])
}

/** The pigeon, facing right. 13 wide, 10 tall: perched, and the two beats of its wings; and a tiny one, 8 by 7, for the ledge outside a window. */
export const BIRD: Record<BirdPose, string[]> = {
  perch: pad(
    [
      '..........o.',
      '.........ogo',
      '........oggeb',
      '..ooo...ogvvo',
      '.oGGgoooggvo.',
      '.oGGgggggggo.',
      '..oGgggwwgo..',
      '...oggggggo..',
      '....ooooop...',
      '.....p..p....'
    ],
    13
  ),
  fly1: pad(
    [
      '.......o....',
      '......ogo...',
      '.....ogGgo.o',
      '....oggGgoge',
      '..ooggggggob',
      '.oGGgggggvo.',
      '..oGgggwgo..',
      '...ogggggo..',
      '....ooooo...',
      '............'
    ],
    13
  ),
  fly2: pad(
    [
      '............',
      '............',
      '............',
      '..........o.',
      '..oo.....ogo',
      '.oGGooooogge',
      '.oGGggggggvb',
      '..oGgggwggo.',
      '...oggggggo.',
      '....oooooo..'
    ],
    13
  ),
  tiny: pad(['......oo', '.....ogb', '..oooggo', '.oGgggo.', '.oGggwo.', '..oooo..', '...p.p..'], 8)
}

export const catTexture = (pose: CatPose) => pixelTexture(CAT[pose], CAT_KEYS, `critter/cat/${pose}`)
export const birdTexture = (pose: BirdPose) => pixelTexture(BIRD[pose], BIRD_KEYS, `critter/bird/${pose}`)
