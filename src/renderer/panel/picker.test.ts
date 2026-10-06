import { describe, expect, it } from 'vitest'
import { PICKER_SOURCE, PICK_MARK, contextText, pickedMessage, type PickedElement } from './picker'

const picked: PickedElement = {
  url: 'http://localhost:5173/',
  selector: 'main > div.hero > button.cta',
  tag: 'button',
  text: 'Sign up',
  html: '<button class="cta">Sign up</button>',
  styles: { color: 'rgb(255, 255, 255)', backgroundColor: 'rgba(0, 0, 0, 0)', margin: '0px', display: 'block' },
  rect: { x: 10, y: 20, width: 100, height: 40 }
}

describe('picking an element from the preview', () => {
  it('describes it for the agent: where, which, what it says, how it looks', () => {
    const t = contextText(picked)
    expect(t).toContain('Element picked from http://localhost:5173/')
    expect(t).toContain('Selector: main > div.hero > button.cta')
    expect(t).toContain('Text: "Sign up"')
    expect(t).toContain('HTML: <button class="cta">Sign up</button>')
  })
  it('leaves out styles that say nothing', () => {
    const t = contextText(picked)
    expect(t).toContain('color: rgb(255, 255, 255)')
    expect(t).not.toContain('margin')
    expect(t).not.toContain('backgroundColor')
  })
  it('caps the HTML and leaves out styles that are only the browser default', () => {
    const long = { ...picked, html: `<button class="cta">${'x'.repeat(500)}</button>`, styles: { ...picked.styles, position: 'static', fontWeight: '400', fontSize: '15px' } }
    const t = contextText(long)
    expect(t.split('\n').find((l) => l.startsWith('HTML: '))!.length).toBeLessThanOrEqual(6 + 241)
    expect(t).toContain('…')
    expect(t).not.toContain('position')
    expect(t).not.toContain('fontWeight')
    expect(t).toContain('fontSize: 15px')
  })
  it('says which view it was seen in, once when every element shares it', () => {
    const m = { label: 'Mobile', w: 390, h: 844 }
    const d = { label: 'Desktop', w: 1280, h: 800 }
    expect(pickedMessage([{ text: 'A', view: m }, { text: 'B', view: m }])).toBe('View: Mobile 390×844\nA\n\nB')
    expect(pickedMessage([{ text: 'A', view: m }, { text: 'B', view: d }])).toBe('View: Mobile 390×844\nA\n\nView: Desktop 1280×800\nB')
    expect(pickedMessage([{ text: 'A' }])).toBe('A')
  })
  it('ships a page script that reports through the console mark the app listens for', () => {
    expect(PICKER_SOURCE).toContain(PICK_MARK)
    expect(() => new Function(PICKER_SOURCE)).not.toThrow()
  })
})
