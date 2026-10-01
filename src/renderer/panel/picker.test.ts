import { describe, expect, it } from 'vitest'
import { PICKER_SOURCE, PICK_MARK, contextText, type PickedElement } from './picker'

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
  it('ships a page script that reports through the console mark the app listens for', () => {
    expect(PICKER_SOURCE).toContain(PICK_MARK)
    expect(() => new Function(PICKER_SOURCE)).not.toThrow()
  })
})
