// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { outlineOf } from './uiOutline'

const page = (html: string) => {
  document.body.innerHTML = html
  return document.body
}

describe('the outline of the app an agent reads to find what to style', () => {
  it('lists each element as tag, classes, id, role and label, indented by depth, and never the words on the page', () => {
    const root = page('<div class="app"><header><h1>agent world</h1><button class="primary" aria-label="Add">+ Agent</button></header><main><div class="stage-wrap"><div class="stage"></div></div><aside class="wide"><nav class="roster" aria-label="Agents"></nav></aside></main></div>')
    const out = outlineOf(root, '.app', 5)
    expect(out.split('\n')).toEqual([
      'div.app',
      '  header',
      '    h1',
      '    button.primary [Add]',
      '  main',
      '    div.stage-wrap',
      '      div.stage',
      '    aside.wide',
      '      nav.roster [Agents]'
    ])
  })

  it('stops at the depth asked, says how much it left out, and never goes into a canvas, a script or a style', () => {
    const root = page('<div class="a"><div class="b"><div class="c"><div class="d"></div></div></div><canvas class="cv"><span>x</span></canvas><script>1</script><style>a{}</style></div>')
    const out = outlineOf(root, '.a', 2)
    expect(out).toContain('div.c')
    expect(out).toContain('… 1 deeper')
    expect(out).not.toContain('div.d')
    expect(out).not.toMatch(/script|style|span/)
    expect(out).toContain('canvas.cv')
  })

  it('names what is hidden, and caps a very long page', () => {
    const root = page('<div class="a"><p class="gone" hidden>x</p>' + '<i class="row"></i>'.repeat(600) + '</div>')
    const out = outlineOf(root, '.a', 3)
    expect(out).toContain('p.gone (hidden)')
    expect(out.split('\n').length).toBeLessThanOrEqual(402)
    expect(out).toMatch(/more not shown/)
  })

  it('leaves out what is written in the page, so an agent that looks cannot read chats or todos', () => {
    const root = page('<div class="app"><div class="msg assistant">the secret plan is blue</div><button>Pay $500 to Jo</button></div>')
    expect(outlineOf(root, '.app', 3)).not.toMatch(/secret|blue|Pay|Jo|500/)
  })
  it('says so when nothing matches, and reads a selector it cannot parse as nothing', () => {
    const root = page('<div></div>')
    expect(outlineOf(root, '.nope', 3)).toBe('Nothing matches .nope.')
    expect(outlineOf(root, '((', 3)).toMatch(/not a valid selector/)
  })
})
