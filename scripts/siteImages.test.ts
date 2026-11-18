import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, run by the Pages workflow
import { imageSize, lazyImages } from './siteImages.mjs'

const root = resolve(__dirname, '..')

describe('reading the size of a picture without a library', () => {
  it('reads a PNG from its header', () => {
    expect(imageSize(readFileSync(join(root, 'docs/images/plan-gate.png')))).toEqual({ w: 1020, h: 1040 })
  })

  it('reads a JPEG from its first frame header, past the segments before it', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03])
    expect(imageSize(jpeg)).toEqual({ w: 600, h: 300 })
  })

  it('reads a GIF', () => {
    expect(imageSize(Buffer.concat([Buffer.from('GIF89a'), Buffer.from([0x20, 0x03, 0x58, 0x02])]))).toEqual({ w: 800, h: 600 })
  })

  it('says nothing for what it does not know', () => {
    expect(imageSize(Buffer.from('<svg></svg>'))).toBeNull()
    expect(imageSize(Buffer.alloc(4))).toBeNull()
  })
})

describe('making every picture of a page lazy, with its size', () => {
  const sizes: Record<string, { w: number; h: number }> = { 'a.png': { w: 1000, h: 500 }, 'b.png': { w: 200, h: 100 } }
  const sizeFor = (src: string) => sizes[src.split('/').pop()!] ?? null

  it('adds lazy loading, async decoding and the picture\'s own size', () => {
    expect(lazyImages('<img src="x/a.png" alt="A">', sizeFor)).toBe('<img src="x/a.png" alt="A" loading="lazy" decoding="async" width="1000" height="500">')
  })

  it('keeps the width the page chose and gives the height that goes with it, so the picture keeps its shape', () => {
    expect(lazyImages('<img src="a.png" alt="" width="720">', sizeFor)).toBe('<img src="a.png" alt="" width="720" loading="lazy" decoding="async" height="360">')
  })

  it('leaves a picture that already says how it loads, and a tag it cannot size', () => {
    expect(lazyImages('<img src="a.png" loading="eager">', sizeFor)).toBe('<img src="a.png" loading="eager">')
    expect(lazyImages('<img src="unknown.png">', sizeFor)).toBe('<img src="unknown.png" loading="lazy" decoding="async">')
  })

  it('handles self-closing tags and several pictures', () => {
    const out = lazyImages('<p><img src="a.png"/><img src="b.png" /></p>', sizeFor)
    expect(out).toBe('<p><img src="a.png" loading="lazy" decoding="async" width="1000" height="500"><img src="b.png" loading="lazy" decoding="async" width="200" height="100"></p>')
  })
})
