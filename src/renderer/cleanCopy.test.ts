// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cleanHtml } from './cleanCopy'

describe('what a copy from the app puts on the clipboard', () => {
  it('drops the styles, classes and scripts the page wears, and keeps the structure', () => {
    const frag = document.createDocumentFragment()
    const box = document.createElement('div')
    box.innerHTML = '<div class="table-wrap" style="background-color: rgb(12, 11, 18)"><table><tr><td style="color: red" data-x="1">A</td></tr></table><p class="x" style="margin:0">Hi <strong style="font-weight:700">there</strong></p><script>1</script></div>'
    frag.append(box)
    const out = cleanHtml(frag)
    expect(out).not.toMatch(/style=|class=|data-|<script/)
    expect(out).toContain('<table>')
    expect(out).toContain('<strong>there</strong>')
    expect(out).toContain('<td>A</td>')
  })
})
