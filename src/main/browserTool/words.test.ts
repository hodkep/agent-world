import { describe, expect, it } from 'vitest'
import { actionOf, sentence } from './words'

const mouse = (type: string, o: object = {}) => actionOf('Input.dispatchMouseEvent', { type, x: 10, y: 20, ...o })

describe('what a command says the agent is doing', () => {
  it('opening a page', () => {
    expect(actionOf('Page.navigate', { url: 'https://example.com/a/b?x=1' })).toMatchObject({ action: { pill: 'OPENING', target: 'example.com/a/b?x=1' } })
    expect(actionOf('Page.reload', {})).toMatchObject({ action: { pill: 'RELOADING' } })
    expect(actionOf('Page.navigateToHistoryEntry', { entryId: 1 })).toMatchObject({ action: { pill: 'GOING BACK' } })
  })

  it('clicking asks the page what is under the pointer; hovering and releasing say nothing new', () => {
    expect(mouse('mousePressed', { clickCount: 1 })).toEqual({ action: { pill: 'CLICKING' }, lookup: { at: [10, 20] } })
    expect(mouse('mousePressed', { clickCount: 2 })).toMatchObject({ action: { pill: 'DOUBLE-CLICK' } })
    expect(mouse('mousePressed', { button: 'right' })).toMatchObject({ action: { pill: 'RIGHT-CLICK' } })
    expect(mouse('mouseMoved')).toBeNull()
    expect(mouse('mouseReleased')).toBeNull()
  })

  it('scrolling says which way', () => {
    expect(mouse('mouseWheel', { deltaY: 120 })).toMatchObject({ action: { pill: 'SCROLLING', target: 'down' } })
    expect(mouse('mouseWheel', { deltaY: -120 })).toMatchObject({ action: { pill: 'SCROLLING', target: 'up' } })
    expect(mouse('mouseWheel', { deltaX: 80, deltaY: 0 })).toMatchObject({ action: { target: 'right' } })
  })

  it('typing names the field, never what was typed', () => {
    expect(actionOf('Input.insertText', { text: 'hunter2' })).toEqual({ action: { pill: 'TYPING' }, lookup: { focus: true } })
    expect(actionOf('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', text: 'a' })).toEqual({ action: { pill: 'TYPING' }, lookup: { focus: true } })
    expect(JSON.stringify(actionOf('Input.insertText', { text: 'hunter2' }))).not.toContain('hunter2')
  })

  it('pressing a special key names it; a key coming up says nothing', () => {
    expect(actionOf('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter' })).toMatchObject({ action: { pill: 'PRESSING', target: 'Enter' } })
    expect(actionOf('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter' })).toBeNull()
  })

  it('resizing says the size and what kind of screen it is, and putting it back is its own words', () => {
    expect(actionOf('Emulation.setDeviceMetricsOverride', { width: 390, height: 844 })).toEqual({ action: { pill: 'RESIZING', target: '390 × 844 · phone' }, size: { w: 390, h: 844, label: 'phone' } })
    expect(actionOf('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180 })?.size?.label).toBe('tablet')
    expect(actionOf('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900 })?.size?.label).toBe('desktop')
    expect(actionOf('Emulation.setDeviceMetricsOverride', { width: 0, height: 0 })).toEqual({ action: { pill: 'RESIZING', target: 'back to the Preview’s size' }, size: null })
    expect(actionOf('Emulation.clearDeviceMetricsOverride', {})).toEqual({ action: { pill: 'RESIZING', target: 'back to the Preview’s size' }, size: null })
  })

  it('looking at the page', () => {
    expect(actionOf('Page.captureScreenshot', {})).toMatchObject({ action: { pill: 'SCREENSHOT', target: 'the page' } })
    expect(actionOf('Accessibility.getFullAXTree', {})).toMatchObject({ action: { pill: 'READING', target: 'the page' } })
    expect(actionOf('DOMSnapshot.captureSnapshot', {})).toMatchObject({ action: { pill: 'READING' } })
  })

  it('recognises the tool’s own scrolling, which it does with a small script, and says which way', () => {
    expect(actionOf('Runtime.evaluate', { expression: 'window.scrollBy(0, 300)' })).toMatchObject({ action: { pill: 'SCROLLING', target: 'down' } })
    expect(actionOf('Runtime.evaluate', { expression: 'window.scrollBy({ top: -200, behavior: "instant" })' })).toMatchObject({ action: { pill: 'SCROLLING', target: 'up' } })
    expect(actionOf('Runtime.evaluate', { expression: 'document.scrollingElement.scrollTo(0, 0)' })).toMatchObject({ action: { pill: 'SCROLLING' } })
    expect(actionOf('Runtime.evaluate', { expression: 'window.scrollBy(0, 300)' })?.action.low).toBeUndefined()
    expect(sentence({ pill: 'SCROLLING' })).toBe('scrolling')
  })

  it('a script is only said when nothing more specific was, since the tools run small scripts to click and type', () => {
    expect(actionOf('Runtime.evaluate', { expression: '1' })).toMatchObject({ action: { pill: 'SCRIPT', low: true } })
    expect(actionOf('Runtime.callFunctionOn', {})).toMatchObject({ action: { low: true } })
  })

  it('what is refused is said as refused', () => {
    expect(actionOf('DOM.setFileInputFiles', {})).toMatchObject({ action: { pill: 'UPLOAD FILE', target: 'not allowed here', refused: true } })
    expect(actionOf('Input.dispatchDragEvent', { type: 'drop', data: { files: ['/a'], items: [] } })).toMatchObject({ action: { pill: 'DROP FILE', target: 'not allowed here', refused: true } })
    expect(actionOf('Input.dispatchDragEvent', { type: 'dragOver', data: { items: [] } })).toMatchObject({ action: { pill: 'DRAGGING' } })
  })

  it('says nothing for the small calls the tools make along the way', () => {
    for (const m of ['DOM.resolveNode', 'DOM.getBoxModel', 'DOM.scrollIntoViewIfNeeded', 'Network.enable', 'Page.enable', 'Runtime.enable', 'Page.getFrameTree', 'Log.enable']) expect(actionOf(m, {})).toBeNull()
  })

  it('reads as a sentence', () => {
    expect(sentence({ pill: 'CLICKING', target: '“Sign in”' })).toBe('clicking “Sign in”')
    expect(sentence({ pill: 'SCREENSHOT', target: 'the page' })).toBe('taking a screenshot of the page')
    expect(sentence({ pill: 'RESIZING', target: '390 × 844 · phone' })).toBe('resizing to 390 × 844 · phone')
    expect(sentence({ pill: 'TYPING', target: 'Username' })).toBe('typing in Username')
    expect(sentence({ pill: 'OPENING', target: 'example.com' })).toBe('opening example.com')
    expect(sentence({ pill: 'SCROLLING', target: 'down' })).toBe('scrolling down')
    expect(sentence({ pill: 'DROP FILE', target: 'not allowed here', refused: true })).toBe('trying to drop a file: not allowed here')
  })
})
