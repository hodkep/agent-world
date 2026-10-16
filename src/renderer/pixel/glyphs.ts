/**
 * The office's small pictures, as bitmaps drawn in code like the rest of its art: `X` is the picture's own colour, `o` the light tone, `.` nothing.
 * A stamp in the chat, a station on the track and a tile in the week are all made from these.
 */
export const GLYPHS = {
  library: ['XXXXXX.', 'XoooXX.', 'XoooXX.', 'XoooXX.', 'XoooXX.', 'XXXXXX.', '.XXXXX.'],
  todo: ['XXXXXXX', 'X....oX', 'X...o.X', 'Xo.o..X', 'X.o...X', 'X.....X', 'XXXXXXX'],
  note: ['XXXXXXX', 'XoooooX', 'XXXXXoX', 'XoooooX', 'XXXoooX', 'XoooooX', 'XXXXXXX'],
  flag: ['X......', 'XXXXX..', 'XXXXXX.', 'XXXXX..', 'X......', 'X......', 'X......'],
  plan: ['XXXXX..', 'XooooX.', 'XoXXoXX', 'XooooXX', 'XoXXoXX', 'XooooXX', 'XXXXXXX'],
  check: ['.......', '.....XX', '....XX.', 'XX.XX..', '.XXX...', '..X....', '.......'],
  review: ['.XXXX..', 'X....X.', 'X....X.', 'X....X.', '.XXXXX.', '.....XX', '......X'],
  land: ['...X...', '...X...', 'X..X..X', '.X.X.X.', '..XXX..', '...X...', 'XXXXXXX'],
  cross: ['X.....X', '.X...X.', '..X.X..', '...X...', '..X.X..', '.X...X.', 'X.....X']
} as const satisfies Record<string, readonly string[]>

export type GlyphName = keyof typeof GLYPHS

/** An agent as a small figure: hair, skin, a shirt in the agent's colour, legs. */
export const SPRITE = ['..HHHH..', '.HHHHHH.', '.HSSSSH.', '.SSSSSS.', '..SSSS..', '.BBBBBB.', 'BBBBBBBB', 'BBBBBBBB', '.BBBBBB.', '.LL..LL.', '.LL..LL.'] as const
