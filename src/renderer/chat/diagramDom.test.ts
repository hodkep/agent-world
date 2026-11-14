// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { addHits, pickedAt } from './diagramDom'

const NS = 'http://www.w3.org/2000/svg'

/** A drawn box whose outline is hand-drawn paths: only the strokes are painted, the inside is empty. */
function drawn(box: { width: number; height: number }) {
  const host = document.createElement('div')
  const svg = document.createElementNS(NS, 'svg')
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('class', 'node rough-node')
  g.appendChild(document.createElementNS(NS, 'path'))
  const text = document.createElementNS(NS, 'text')
  text.textContent = 'Postgres'
  g.appendChild(text)
  ;(g as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 4, y: 6, ...box })
  svg.appendChild(g)
  host.appendChild(svg)
  return { host, g }
}

describe('addHits: the inside of a box', () => {
  it('gets an invisible rect over its whole box, so a click on the empty inside of a hand-drawn shape still lands on it', () => {
    const { host, g } = drawn({ width: 140, height: 80 })
    addHits(host)
    const hit = g.querySelector(':scope > rect.node-hit')!
    expect(hit).not.toBeNull()
    expect(['x', 'y', 'width', 'height'].map((a) => hit.getAttribute(a))).toEqual(['4', '6', '140', '80'])
    expect(hit.getAttribute('fill')).toBe('transparent')
    expect(hit.getAttribute('pointer-events')).toBe('all')
    expect(g.firstElementChild).toBe(hit)
    expect(pickedAt(hit, host)).toBe('Postgres')
  })

  it('is added once, however often the diagram is drawn again', () => {
    const { host, g } = drawn({ width: 140, height: 80 })
    addHits(host)
    addHits(host)
    expect(g.querySelectorAll('rect.node-hit')).toHaveLength(1)
  })

  it('is not added to a box that has no size yet (a hidden diagram)', () => {
    const { host, g } = drawn({ width: 0, height: 0 })
    addHits(host)
    expect(g.querySelector('rect.node-hit')).toBeNull()
  })
})
