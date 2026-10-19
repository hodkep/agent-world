/** The colours an identicon may take, as the app's own colour tokens. */
export const IDENTICON_COLORS = ['var(--accent)', 'var(--think)', 'var(--violet)', 'var(--ok-text)', 'var(--claude)', 'var(--danger-text)', 'var(--accent-hot)', 'var(--danger-hot)'] as const

/** FNV-1a over the characters: a small, stable number for a name, the same in every window and every run. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** A name's own little picture: 5 by 5 cells, mirrored left to right (so it reads as a face or a creature), in one colour, the same for the same name. */
export function identicon(name: string): { cells: boolean[]; color: (typeof IDENTICON_COLORS)[number] } {
  const key = name.trim().toLowerCase()
  const h = hash(key)
  // A second, unrelated number for the cells, so the colour does not decide the shape.
  let bits = hash(`${key}#`) || 1
  const half: boolean[] = []
  for (let i = 0; i < 15; i++) {
    half.push((bits & 1) === 1)
    bits = (bits >>> 1) | ((bits & 1) << 30)
    if (i === 14) bits ^= h
  }
  // Never nearly empty: a picture needs enough cells to be seen.
  if (half.filter(Boolean).length < 4) for (let i = 0; i < 15; i += 3) half[i] = true
  const cells: boolean[] = []
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) cells.push(half[y * 3 + (x < 3 ? x : 4 - x)]!)
  return { cells, color: IDENTICON_COLORS[h % IDENTICON_COLORS.length]! }
}
