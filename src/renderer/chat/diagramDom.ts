const PAPER = '#0c0b12'
/** A box in the drawing: Mermaid's own `node`, and `rough-node` when it is drawn by hand. Arrows are neither, so they cannot be picked. */
export const BOX = '.node, .rough-node'

export const labelOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Marks the boxes whose words are in the list as picked. */
export function showPicks(host: HTMLElement | null, names: string[]) {
  host?.querySelectorAll(BOX).forEach((n) => n.classList.toggle('sel', names.includes(labelOf(n))))
}

/** The diagram's SVG as a PNG (twice its size, on the chat's dark paper), for the editor, the clipboard and an attachment. */
export async function pngOf(host: HTMLElement): Promise<Blob> {
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('No diagram to draw')
  const copy = svg.cloneNode(true) as SVGSVGElement
  copy.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'))
  const box = svg.viewBox.baseVal
  const w = box?.width || svg.getBoundingClientRect().width
  const h = box?.height || svg.getBoundingClientRect().height
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copy.setAttribute('width', String(w))
  copy.setAttribute('height', String(h))
  copy.removeAttribute('style')
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }))
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => no(new Error('The diagram could not be drawn as a picture'))
      i.src = url
    })
    const c = document.createElement('canvas')
    c.width = Math.round(w * 2)
    c.height = Math.round(h * 2)
    const g = c.getContext('2d')!
    g.fillStyle = PAPER
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('The diagram could not be saved as a picture'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
