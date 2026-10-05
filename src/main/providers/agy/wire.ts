/** Just enough protobuf reading for agy's conversation files: fields by number, nested by path. Anything else is skipped. */
export interface Field {
  n: number
  /** The number, for a varint field. */
  v?: number
  /** The bytes, for a length-delimited field (text or a nested message). */
  b?: Buffer
}

function varint(b: Buffer, at: number): [number, number] {
  let r = 0
  let shift = 0
  let i = at
  for (;;) {
    const c = b[i++]
    if (c === undefined) throw new RangeError('truncated')
    r += (c & 0x7f) * 2 ** shift
    if (!(c & 0x80)) return [r, i]
    shift += 7
  }
}

/** The fields of one message; a message that does not parse gives nothing, since the file is undocumented and may change. */
export function fields(b: Buffer | null | undefined): Field[] {
  if (!b) return []
  const out: Field[] = []
  try {
    let i = 0
    while (i < b.length) {
      let key: number
      ;[key, i] = varint(b, i)
      const n = key / 8 | 0
      const wire = key & 7
      if (wire === 0) {
        let v: number
        ;[v, i] = varint(b, i)
        out.push({ n, v })
      } else if (wire === 2) {
        let len: number
        ;[len, i] = varint(b, i)
        if (i + len > b.length) return []
        out.push({ n, b: b.subarray(i, i + len) })
        i += len
      } else if (wire === 1) i += 8
      else if (wire === 5) i += 4
      else return []
    }
  } catch {
    return []
  }
  return out
}

/** Every field with this path ("5.4.1"), looking inside nested messages along the way. */
export function all(b: Buffer | null | undefined, path: string): Field[] {
  const [head, ...rest] = path.split('.').map(Number)
  const here = fields(b).filter((f) => f.n === head)
  return rest.length ? here.flatMap((f) => all(f.b, rest.join('.'))) : here
}

export const text = (b: Buffer | null | undefined, path: string) => all(b, path).find((f) => f.b)?.b?.toString('utf8')
export const num = (b: Buffer | null | undefined, path: string) => all(b, path).find((f) => f.v !== undefined)?.v
