const PAPER = '#0c0b12'
/** A box in the drawing: Mermaid's own `node`, and `rough-node` when it is drawn by hand. Arrows are neither, so they cannot be picked. */
export const BOX = '.node, .rough-node'
export const labelOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/** Something in the drawing that can be picked: its name (as it is told to the agent) and the parts of the drawing that make it up. */
export interface Unit {
  key: string
  els: Element[]
}

/**
 * What can be picked in a diagram. In a flowchart, a state diagram and so on, the boxes (arrows cannot be). In a sequence diagram the
 * messages are the content, so they can be picked too, with the participants (their boxes at both ends, their lifelines and the
 * bars on them) and the notes; a message is named by its number from the top, since the same words come up again and again.
 */
export function unitsOf(host: Element): Unit[] {
  const units = new Map<string, Element[]>()
  const add = (key: string, ...els: Element[]) => key && units.set(key, [...(units.get(key) ?? []), ...els])
  host.querySelectorAll(BOX).forEach((n) => add(labelOf(n), n))

  const lifelines: { x: number; key: string }[] = []
  host.querySelectorAll('rect.actor').forEach((r) => {
    const text = r.nextElementSibling
    if (!text?.matches('text.actor')) return
    const key = labelOf(text)
    const els = [r, text]
    const line = r.previousElementSibling
    if (line?.matches('line.actor-line')) (els.push(line), lifelines.push({ x: Number(line.getAttribute('x1')), key }))
    add(key, ...els)
  })
  host.querySelectorAll('rect[class*="activation"]').forEach((r) => {
    const x = Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2
    const near = lifelines.reduce<{ x: number; key: string } | null>((best, l) => (!best || Math.abs(l.x - x) < Math.abs(best.x - x) ? l : best), null)
    if (near) add(near.key, r)
  })
  host.querySelectorAll('g').forEach((g) => {
    const rect = g.querySelector(':scope > rect.note')
    const text = g.querySelector(':scope > text.noteText')
    if (rect && text) add(`note: ${labelOf(text)}`, rect, text)
  })
  let n = 0
  host.querySelectorAll('text.messageText').forEach((t) => {
    n++
    const els = [t]
    for (let s = t.nextElementSibling; s && !s.matches('text.messageText'); s = s.nextElementSibling) {
      if (!s.matches('[class*="messageLine"]')) continue
      els.push(s)
      // The wide, invisible copy of the line that makes it easy to hit.
      if (s.nextElementSibling?.matches('.hit')) els.push(s.nextElementSibling)
      break
    }
    add(`message ${n}: ${labelOf(t)}`, ...els)
  })
  return [...units].map(([key, els]) => ({ key, els }))
}

/** A thin line is hard to click: each message line gets a wide invisible copy beside it. */
export function addHits(host: Element | null) {
  host?.querySelectorAll('[class*="messageLine"]:not(.hit)').forEach((l) => {
    if (l.nextElementSibling?.classList.contains('hit')) return
    const hit = l.cloneNode(false) as SVGElement
    hit.classList.add('hit')
    ;['marker-end', 'marker-start', 'style'].forEach((a) => hit.removeAttribute(a))
    hit.setAttribute('stroke', 'transparent')
    hit.setAttribute('stroke-width', '16')
    hit.setAttribute('fill', 'none')
    hit.setAttribute('pointer-events', 'stroke')
    l.after(hit)
  })
}

/** The name of what a click landed on; null for an arrow in a flowchart, a label or empty space. */
export function pickedAt(target: Element, host: Element): string | null {
  return unitsOf(host).find((u) => u.els.some((e) => e === target || e.contains(target)))?.key ?? null
}

/** Whether there is anything in the diagram to pick. */
export const hasBoxes = (host: Element | null) => !!host && unitsOf(host).length > 0

/** Marks what is in the list as picked, and nothing else. */
export function showPicks(host: Element | null, names: string[]) {
  if (!host) return
  host.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'))
  for (const u of unitsOf(host)) if (names.includes(u.key)) u.els.forEach((e) => e.classList.add('sel'))
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
