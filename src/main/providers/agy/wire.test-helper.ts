// Builds protobuf messages the way agy's conversation files hold them, so tests need no real conversation.
const enc = (n: number) => {
  const out: number[] = []
  let v = n
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return Buffer.from(out)
}
export const varint = (field: number, v: number) => Buffer.concat([enc(field << 3), enc(v)])
export const bytes = (hex: string) => Buffer.from(hex, 'hex')
export const str = (field: number, s: string) => {
  const b = Buffer.from(s, 'utf8')
  return Buffer.concat([enc((field << 3) | 2), enc(b.length), b])
}
export const msg = (field: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([enc((field << 3) | 2), enc(body.length), body])
}
