// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { FreshTracker, revealWords } from './reveal'

const box = (html: string) => {
  const d = document.createElement('div')
  d.innerHTML = html
  return d
}

describe('revealing a reply word by word', () => {
  it('wraps each word of the text in a span numbered in order, and leaves the text as it was', () => {
    const d = box('<p>Done. The <strong>reply</strong> eases in.</p><ul><li>one two</li></ul>')
    const before = d.textContent
    expect(revealWords(d)).toBe(true)
    const w = [...d.querySelectorAll<HTMLElement>('.w-r')]
    expect(w.map((x) => x.textContent)).toEqual(['Done.', 'The', 'reply', 'eases', 'in.', 'one', 'two'])
    expect(w.map((x) => x.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4', '5', '6'])
    expect(d.textContent).toBe(before)
    expect(d.querySelector('strong')!.textContent).toBe('reply')
  })
  it('leaves code, code blocks, pictures and buttons alone', () => {
    const d = box('<p>Run <code>pnpm test</code> now</p><pre><code>a b c</code></pre><button>Copy it</button>')
    revealWords(d)
    expect([...d.querySelectorAll('.w-r')].map((x) => x.textContent)).toEqual(['Run', 'now'])
    expect(d.querySelector('pre')!.innerHTML).toBe('<code>a b c</code>')
  })
  it('keeps the whole reveal short: the pause between words shrinks as the reply grows', () => {
    const few = box('<p>a b c</p>')
    revealWords(few)
    expect(few.style.getPropertyValue('--step')).toBe('30ms')
    const many = box(`<p>${Array.from({ length: 400 }, () => 'w').join(' ')}</p>`)
    revealWords(many)
    expect(parseFloat(many.style.getPropertyValue('--step'))).toBeLessThanOrEqual(1800 / 400)
  })
  it('drops the blur for a longer reply, where hundreds of blurred words at once would be heavy to draw', () => {
    const few = box('<p>a b c</p>')
    revealWords(few)
    expect(few.style.getPropertyValue('--blur')).toBe('4px')
    const many = box(`<p>${Array.from({ length: 300 }, () => 'w').join(' ')}</p>`)
    revealWords(many)
    expect(many.style.getPropertyValue('--blur')).toBe('0px')
  })
  it('does nothing for a very long reply, which just appears', () => {
    const d = box(`<p>${Array.from({ length: 900 }, () => 'w').join(' ')}</p>`)
    expect(revealWords(d)).toBe(false)
    expect(d.querySelector('.w-r')).toBeNull()
  })
})

describe('which messages are new', () => {
  it('counts none as new while the chat opens, then one that arrives later for a second', () => {
    const t = new FreshTracker(0)
    t.see(['a', 'b'], 100)
    expect(t.isFresh('a', 100)).toBe(false)
    t.see(['a', 'b', 'c'], 5000)
    expect(t.isFresh('c', 5000)).toBe(true)
    expect(t.isFresh('c', 5900)).toBe(true)
    expect(t.isFresh('c', 6100)).toBe(false)
    expect(t.isFresh('a', 5000)).toBe(false)
  })
  it('does not count a whole history that arrives at once as new', () => {
    const t = new FreshTracker(0)
    t.see(['a'], 4000)
    t.see(['a', 'b', 'c', 'd', 'e', 'f'], 8000)
    expect(['b', 'c', 'd', 'e', 'f'].some((id) => t.isFresh(id, 8000))).toBe(false)
  })
})
