// The site's pictures: read a picture's size from its header (no library), and make every picture of a page lazy with that size,
// so a slow connection fetches only what is near the screen and nothing shifts when a picture arrives.

/** The width and height of a PNG, GIF or JPEG from its first bytes, or null for anything else. */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  if (buf.length >= 10 && buf.toString('latin1', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    for (let i = 2; i + 9 < buf.length; ) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      // A frame header (not the tables, not the arithmetic-coding marker): the size is in it.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  return null
}

/**
 * Every <img> of a page gets lazy loading, async decoding and its size. A width the page chose is kept and given the height that goes with it
 * (the picture keeps its shape); a tag that already says how it loads, or whose size is unknown, only gets what can be given.
 * `sizeFor(src)` returns { w, h } or null.
 */
export function lazyImages(html, sizeFor) {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\sloading=/.test(tag)) return tag
    const src = tag.match(/\ssrc="([^"]+)"/)?.[1]
    if (!src) return tag
    const dim = sizeFor(src)
    let out = `${tag.replace(/\s*\/?>$/, '')} loading="lazy" decoding="async"`
    if (dim) {
      const chosen = Number(tag.match(/\swidth="(\d+)"/)?.[1] ?? 0)
      if (chosen) { if (!/\sheight=/.test(tag)) out += ` height="${Math.round((chosen * dim.h) / dim.w)}"` }
      else out += ` width="${dim.w}" height="${dim.h}"`
    }
    return `${out}>`
  })
}
