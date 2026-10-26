const PAPER = '#0c0b12'
/** A box in the drawing: Mermaid's own `node`, and `rough-node` when it is drawn by hand. Arrows are neither, so they cannot be picked. */
export const BOX = '.node, .rough-node'
/** In a sequence diagram the participants are boxes too, drawn twice (at the top and at the bottom); the messages between them are arrows. */
const ACTOR = 'rect.actor, text.actor'

export const labelOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/** The words of a participant's box: the text itself, or the text next to a rectangle. */
function actorName(el: Element): string {
  if (el.tagName.toLowerCase() === 'text') return labelOf(el)
  const text = [el.nextElementSibling, el.previousElementSibling].find((n) => n?.matches('text.actor'))
  return text ? labelOf(text) : ''
}

/** The box (or participant) a click landed on, as the words written on it; null for an arrow, a label or empty space. */
export function pickedAt(target: Element, host: Element): string | null {
  const box = target.closest(BOX)
  if (box && host.contains(box)) return labelOf(box) || null
  const actor = target.closest(ACTOR)
  return actor && host.contains(actor) ? actorName(actor) || null : null
}

/** Whether there is anything in the diagram to pick. */
export const hasBoxes = (host: Element | null) => !!host?.querySelector(`${BOX}, ${ACTOR}`)

/** Marks the boxes whose words are in the list as picked (a participant at both of its ends). */
export function showPicks(host: Element | null, names: string[]) {
  host?.querySelectorAll(BOX).forEach((n) => n.classList.toggle('sel', names.includes(labelOf(n))))
  host?.querySelectorAll(ACTOR).forEach((n) => n.classList.toggle('sel', names.includes(actorName(n))))
}

/** The list with the name added, or taken out when it is there. */
export const toggled = (names: string[], name: string) => (names.includes(name) ? names.filter((n) => n !== name) : [...names, name])

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
