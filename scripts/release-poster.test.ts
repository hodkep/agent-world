import { describe, expect, it } from 'vitest'
// @ts-expect-error: a plain .mjs script, no types
import { buildPosterHtml } from './release-poster.mjs'

const TEMPLATE = '<h1>{{version}}</h1><p>{{tagline}}</p>{{cards}}{{also}}<i>{{footer}}</i>'
const card = (n: number) => ({ kicker: `Kicker ${n}`, title: `Title ${n}`, text: `Text ${n}` })
const base = { version: '0.9.0', tagline: 'Make it yours.', cards: [card(1), card(2), card(3)] }

describe('the release poster', () => {
  it('writes the version, the tagline and one block for each card', () => {
    const html = buildPosterHtml(TEMPLATE, base)
    expect(html).toContain('<h1>0.9.0</h1>')
    expect(html).toContain('Make it yours.')
    expect(html.match(/class="pcard"/g)).toHaveLength(3)
  })

  it('escapes what it is given, so a title cannot add markup', () => {
    const html = buildPosterHtml(TEMPLATE, { ...base, cards: [{ ...card(1), title: '<img src=x onerror=alert(1)>' }, card(2)] })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('refuses fewer than two cards, more than four, and text that would not fit', () => {
    expect(() => buildPosterHtml(TEMPLATE, { ...base, cards: [card(1)] })).toThrow(/2 to 4 cards/)
    expect(() => buildPosterHtml(TEMPLATE, { ...base, cards: [1, 2, 3, 4, 5].map(card) })).toThrow(/2 to 4 cards/)
    expect(() => buildPosterHtml(TEMPLATE, { ...base, cards: [{ ...card(1), title: 'x'.repeat(61) }, card(2)] })).toThrow(/title/)
    expect(() => buildPosterHtml(TEMPLATE, { ...base, version: '' })).toThrow(/version/)
  })

  it('leaves out the Also strip and the footer when there are none', () => {
    const html = buildPosterHtml(TEMPLATE, base)
    expect(html).not.toContain('Also in')
    expect(html).toContain('<i></i>')
    const withAlso = buildPosterHtml(TEMPLATE, { ...base, also: ['Icon tabs', 'Hide office'] })
    expect(withAlso).toContain('Also in 0.9.0')
    expect(withAlso.match(/class="pchip"/g)).toHaveLength(2)
  })
  it('shows a big figure on a card when it has one, and refuses one that would not fit', () => {
    const html = buildPosterHtml(TEMPLATE, { ...base, cards: [{ ...card(1), big: '46 s', bigLabel: 'a 267 MB update' }, card(2)] })
    expect(html).toContain('class="pbig">46 s<')
    expect(html).toContain('a 267 MB update')
    expect(buildPosterHtml(TEMPLATE, base)).not.toContain('pbig')
    expect(() => buildPosterHtml(TEMPLATE, { ...base, cards: [{ ...card(1), big: 'x'.repeat(11) }, card(2)] })).toThrow(/big/)
  })
})
