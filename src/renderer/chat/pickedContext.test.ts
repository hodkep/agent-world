import { describe, expect, it } from 'vitest'
import { splitPicked } from './pickedContext'

const block = [
  'Element picked from files-tabs.html',
  'Selector: div#zoomstrip.zoom',
  'Text: "− + Fit office Reset"',
  'HTML: <div class="zoom" id="zoomstrip"> <button>−</button> </div>',
  'Computed style: color: rgb(228, 228, 238); display: flex',
  'Picture of it: @"/tmp/aw/div-picked.png"'
].join('\n')

describe('an element picked on the Preview, as it reads in a sent message', () => {
  it('is taken out of the words and kept as one pick with its parts', () => {
    const { picks, rest } = splitPicked(`${block}\n\nCan you tell me what I just tagged.`)
    expect(rest).toBe('Can you tell me what I just tagged.')
    expect(picks).toEqual([
      {
        label: 'div on files-tabs.html',
        from: 'files-tabs.html',
        selector: 'div#zoomstrip.zoom',
        text: '− + Fit office Reset',
        html: '<div class="zoom" id="zoomstrip"> <button>−</button> </div>',
        style: 'color: rgb(228, 228, 238); display: flex',
        picture: '/tmp/aw/div-picked.png'
      }
    ])
  })

  it('needs only the address and the selector, and names a local page by host and path', () => {
    const { picks, rest } = splitPicked('Element picked from http://localhost:5287/shop/cart\nSelector: button#cta.big')
    expect(rest).toBe('')
    expect(picks).toEqual([{ label: 'button on localhost:5287/shop/cart', from: 'http://localhost:5287/shop/cart', selector: 'button#cta.big' }])
  })

  it('finds several, one after another, and leaves the words around them', () => {
    const second = block.replace('files-tabs.html', 'other.html').replace('div#zoomstrip.zoom', 'span.x')
    const { picks, rest } = splitPicked(`Look at these:\n\n${block}\n\n${second}\n\nwhy different?`)
    expect(picks.map((p) => p.label)).toEqual(['div on files-tabs.html', 'span on other.html'])
    expect(rest).toBe('Look at these:\n\nwhy different?')
  })

  it('leaves alone words that only mention picking, or a block without a selector', () => {
    for (const t of ['I picked an element earlier', 'Please read: Element picked from the list\nthen answer', 'Element picked from nowhere']) {
      expect(splitPicked(t)).toEqual({ picks: [], rest: t })
    }
  })

  it('reads the view line before it, once for all or one each, and leaves a view line that heads nothing alone', () => {
    const one = splitPicked(`View: Mobile 390×844\n${block}\n\n${block.replace('files-tabs.html', 'b.html')}\n\nlook`)
    expect(one.picks.map((p) => p.view)).toEqual([{ label: 'Mobile', w: 390, h: 844 }, { label: 'Mobile', w: 390, h: 844 }])
    expect(one.rest).toBe('look')
    const two = splitPicked(`View: Mobile 390×844\n${block}\n\nView: Desktop 1280×800\n${block.replace('files-tabs.html', 'b.html')}`)
    expect(two.picks.map((p) => p.view?.label)).toEqual(['Mobile', 'Desktop'])
    expect(splitPicked('View: Mobile 390×844\njust words').rest).toBe('View: Mobile 390×844\njust words')
    expect(splitPicked(block).picks[0]!.view).toBeUndefined()
  })
})
