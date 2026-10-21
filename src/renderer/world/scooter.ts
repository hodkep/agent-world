// A small scooter seen from the side, facing right, for the courier and the pizza delivery. 24 wide, 14 tall.
// Keys: o outline · b body · B body shade · w tyre · W hub · s seat · l headlight · x box · X box shade · t box lid

export const SCOOTER: string[] = [
  '................oo......',
  '...............ooo......',
  '................o.......',
  '................ob......',
  '.....ssss.......obb.....',
  '....osssso......obb....l',
  '..oooooooooooooobbbo...l',
  '..obbbbbbbbbbbbbbbbo....',
  '..oBBBBBBBBBBBBBBBo.....',
  '.oooooo........ooooo....',
  'owwwwwwo......owwwwwwo..',
  'owwWWwwo......owwWWwwo..',
  'owwWWwwo......owwWWwwo..',
  '.owwwwo........owwwwo...'
]

/** The delivery box on the pizza scooter's back, drawn over the scooter's rear. 8 wide, 5 tall. */
export const BOX: string[] = ['oooooooo', 'otttttto', 'oxxxxxxo', 'oXXXXXXo', 'oooooooo']

export const SCOOTER_KEYS = (body: number, shade: number): Record<string, number> => ({ o: 0x1a1522, b: body, B: shade, w: 0x2a2a32, W: 0xc8ccd8, s: 0x2a2030, l: 0xffe9a0, x: 0xe8e0c8, X: 0xc8bfa0, t: 0xf4f0e0 })
export const SCOOTER_COLORS = { courier: [0xd8782a, 0xb05a1c], pizza: [0xc8302e, 0x9a2024] } as const
