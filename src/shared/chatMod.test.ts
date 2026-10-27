import { describe, expect, it } from 'vitest'
import { GUARD_CSS, checkMod, cleanCss, isEmptyMod, EMPTY_MOD, themeProblems } from './chatMod'

describe('CSS an agent writes', () => {
  it('passes plain CSS, and nothing at all', () => {
    expect(cleanCss(':root { --accent: #ff6600 }\n.msg.user { border-radius: 8px }')).toEqual({ css: ':root { --accent: #ff6600 }\n.msg.user { border-radius: 8px }', problems: [] })
    expect(cleanCss('')).toEqual({ css: '', problems: [] })
    expect(cleanCss(undefined)).toEqual({ css: '', problems: [] })
  })
  it('refuses what loads or runs something from outside, and says why', () => {
    for (const bad of ['@import url(https://x.y/a.css);', '.a { background: url(https://x.y/a.png) }', '.a { background: url(/etc/passwd) }', '.a { width: expression(alert(1)) }', '.a { background: url(javascript:alert(1)) }', '.a { -moz-binding: url(x) }']) {
      const c = cleanCss(bad)
      expect(c.css, bad).toBe('')
      expect(c.problems.length, bad).toBeGreaterThan(0)
    }
  })
  it('allows a picture written into the CSS itself', () => {
    expect(cleanCss('.a { background: url("data:image/png;base64,AAAA") }').problems).toEqual([])
  })
  it('refuses braces that do not match, which would swallow what follows, and too much text', () => {
    expect(cleanCss('.a { color: red ').problems[0]).toMatch(/braces/)
    expect(cleanCss('} .a { color: red }').problems[0]).toMatch(/braces/)
    expect(cleanCss('a{}'.repeat(30_000)).problems[0]).toMatch(/longer/)
  })
  it('a comment hides nothing from the check, and is not itself a problem', () => {
    expect(cleanCss('/* @import url(x) */ .a { color: red }').problems).toEqual([])
    expect(cleanCss('.a { background: u/**/rl(https://x.y/a.png) }').problems.length).toBeGreaterThan(0)
  })
  it('is not fooled by an escape spelling a word the checks look for, but allows one inside a string', () => {
    for (const bad of ['.a { background: \\75rl(https://x.y/a.png) }', '@\\69mport "x.css";', '.a { background: u\\72l(https://x.y/a.png) }']) expect(cleanCss(bad).problems.length, bad).toBeGreaterThan(0)
    expect(cleanCss('.a::before { content: "\\2022" }').problems).toEqual([])
  })
})

describe('a look as written', () => {
  it('reads layout rules and CSS together, keeps what is understood and names what is not', () => {
    const c = checkMod({ layout: [{ match: { kind: ['thinking'] }, place: 'hidden' }, { place: 'sideways' }], css: '.a { color: red }' })
    expect(c.mod.layout.rules).toHaveLength(1)
    expect(c.mod.css).toBe('.a { color: red }')
    expect(c.problems).toHaveLength(1)
  })
  it('the empty look is the system default', () => {
    expect(isEmptyMod(EMPTY_MOD)).toBe(true)
    expect(isEmptyMod(checkMod({ css: ' ' }).mod)).toBe(true)
    expect(isEmptyMod(checkMod({ css: 'a{}' }).mod)).toBe(false)
  })
})

describe('what an agent is told', () => {
  it('names the tools to look with and the parts of the chat it is likely to be asked about', async () => {
    const { CHAT_MOD_GUIDE } = await import('./chatMod')
    for (const word of ['app_ui_outline', 'app_ui_screenshot', 'chat_mod_write', '.of-head', '.of-card', '.tc-line', '.lay-chip', '.composer', '--ink', 'OUTLINE', 'map its editor background', 'chat-top', 'above-composer', 'window-bottom', 'onData', 'no network', 'meters', 'd.feeds', 'textContent', 'Load data', 'never code', 'chat-behind', 'typing', 'never the letters', 'Undo is an answer', 'addCss', 'addWidgets', 'removeWidgets']) expect(CHAT_MOD_GUIDE, word).toContain(word)
  })
})

describe('what no look can take away', () => {
  it('keeps the message box, a permission request and the Keep and Undo bar showing', () => {
    for (const part of ['.composer', '.inline-need', '.mod-bar']) expect(GUARD_CSS).toContain(part)
    expect(GUARD_CSS).toMatch(/visibility: visible !important/)
  })
})

describe('a colour theme an agent writes into :root', () => {
  const dracula = ':root{--bg:#21222c;--panel:#282a36;--panel-2:#343746;--panel-3:#21222c;--line:#44475a;--ink:#191a21;--text:#f8f8f2;--muted:#a8aed3;--accent:#bd93f9;--well:#1e1f29}'
  it('passes a theme whose outline colour is the darkest, whose text can be read, and which says nothing about the rest', () => {
    expect(themeProblems(dracula)).toEqual([])
    expect(themeProblems('.a { color: red }')).toEqual([])
    expect(themeProblems('')).toEqual([])
  })
  it('refuses a light --ink: it is the outline drawn round buttons and panels, so every border would turn white', () => {
    const p = themeProblems(':root{--ink:#bbbbbb;--panel:#3c3f41;--text:#a9b7c6}')
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/--ink.*darker than --panel/)
    expect(p[0]).toMatch(/--text/)
  })
  it('judges a colour against the default of the one it was not given with', () => {
    expect(themeProblems(':root{--ink:#e0e0e0}')[0]).toMatch(/--ink/)
    expect(themeProblems(':root{--text:#222222}')[0]).toMatch(/--text.*panel/)
  })
  it('refuses text that cannot be read on the panels, and accent text that cannot be read on --ink', () => {
    expect(themeProblems(':root{--panel:#282a36;--bg:#282a36;--text:#555566}')[0]).toMatch(/contrast/)
    expect(themeProblems(':root{--accent:#222233;--ink:#050508}')[0]).toMatch(/--accent/)
  })
  it('a light theme is fine when its outlines stay darker than its surfaces', () => {
    expect(themeProblems(':root{--bg:#f5f5f5;--panel:#ffffff;--panel-2:#eeeeee;--ink:#222222;--text:#1a1a1a;--muted:#555555;--accent:#ffb86c}')).toEqual([])
  })
  it('colours it cannot read (names, var(), rgb) are left alone, and the last declaration wins', () => {
    expect(themeProblems(':root{--ink:white}')).toEqual([])
    expect(themeProblems(':root{--ink:#bbbbbb} :root{--ink:#111111}')).toEqual([])
  })
  it('is part of reading a look: a write with such a theme is refused with the reason', () => {
    const c = checkMod({ css: ':root{--ink:#bbbbbb}' })
    expect(c.problems[0]).toMatch(/--ink/)
    expect(c.mod.css).toBe('')
  })
})
