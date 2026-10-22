// A QR code encoder for the phone link: byte mode, error correction L, versions 1 to 6 (up to 134 bytes), mask 0.
// ponytail: mask 0 only, no penalty scoring (a scanner reads any mask); more than 134 bytes is refused, version 7+ needs version bits.

// [data codewords, error-correction codewords per block, blocks, alignment-pattern centre]
const VERSIONS = [[19, 7, 1, 0], [34, 10, 1, 18], [55, 15, 1, 22], [80, 20, 1, 26], [108, 26, 1, 30], [136, 18, 2, 34]] as const

const mul = (a: number, b: number) => {
  let r = 0
  for (let i = 7; i >= 0; i--) r = ((r << 1) ^ ((r >>> 7) * 0x11d)) ^ (((b >>> i) & 1) * a)
  return r & 0xff
}

function rsRemainder(data: number[], degree: number) {
  const div = new Array<number>(degree).fill(0)
  div[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      div[j] = mul(div[j]!, root)
      if (j + 1 < degree) div[j]! ^= div[j + 1]!
    }
    root = mul(root, 2)
  }
  const rem = new Array<number>(degree).fill(0)
  for (const b of data) {
    const f = b ^ rem.shift()!
    rem.push(0)
    for (let i = 0; i < degree; i++) rem[i]! ^= mul(div[i]!, f)
  }
  return rem
}

/** The code for `text` as rows of modules, true = dark. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)]
  const v = VERSIONS.findIndex(([data]) => data - 2 >= bytes.length)
  if (v < 0) throw new Error('That text is too long for the code.')
  const [dataCw, eccCw, blocks, align] = VERSIONS[v]!

  // Mode 0100, 8-bit length, the bytes, a terminator, then padding to the capacity.
  const bits: number[] = []
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(4, 4)
  put(bytes.length, 8)
  bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, dataCw * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xec; data.length < dataCw; pad ^= 0xec ^ 0x11) data.push(pad)

  // Split into blocks, add each block's error correction, and interleave.
  const per = dataCw / blocks
  const parts = Array.from({ length: blocks }, (_, b) => data.slice(b * per, (b + 1) * per))
  const eccs = parts.map((p) => rsRemainder(p, eccCw))
  const out: number[] = []
  for (let i = 0; i < per; i++) parts.forEach((p) => out.push(p[i]!))
  for (let i = 0; i < eccCw; i++) eccs.forEach((e) => out.push(e[i]!))

  const size = 17 + 4 * (v + 1)
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { m[y]![x] = dark; fn[y]![x] = true }
  for (let i = 0; i < size; i++) (set(6, i, i % 2 === 0), set(i, 6, i % 2 === 0))
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4)
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  if (align) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align + dx, align + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)

  // Format: level L (01) and mask 0, with its BCH check bits.
  let rem = 0b01000
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const fmt = ((0b01000 << 10) | rem) ^ 0x5412
  const bit = (i: number) => ((fmt >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) set(8, i, bit(i))
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
  set(8, size - 8, true)

  // The codewords, two columns at a time from the bottom right, with mask 0 (flip where x + y is even).
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
      if (fn[y]![x] || k >= out.length * 8) continue
      m[y]![x] = (((out[k >>> 3]! >>> (7 - (k & 7))) & 1) === 1) !== ((x + y) % 2 === 0)
      k++
    }
  }
  return m
}
