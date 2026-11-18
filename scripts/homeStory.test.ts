import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (f: string) => readFileSync(join(root, f), 'utf8')
const readme = read('README.md')
const home = read('site/home.html')

// The README and the site's first screen sell what the app does about agents that skip the process (workflows, the playbook, the skills, MCP and tools manager, the Preview); the pixel office is one section lower down.
describe('the README leads with the problem and what solves it', () => {
  const lead = readme.slice(0, readme.indexOf('## '))

  it('says the headline and names what solves it before the first heading', () => {
    expect(lead).toContain('Your agents skip the process')
    for (const word of ['workflow', 'playbook', 'Preview']) expect(lead.toLowerCase()).toContain(word.toLowerCase())
  })

  it('is honest that the holds are not a lock', () => {
    expect(readme).toMatch(/guard rail, not a lock/)
  })

  it('shows workflows, the playbook and the tools before the office', () => {
    const at = (h: string) => readme.indexOf(h)
    expect(at('### ')).toBeGreaterThan(-1)
    const office = at('Also: the office')
    expect(office).toBeGreaterThan(-1)
    for (const h of ['Workflows and the push hold', 'Library and playbook', 'Skills, MCP servers and tools', 'Preview']) {
      expect(at(h), h).toBeGreaterThan(-1)
      expect(at(h), h).toBeLessThan(office)
    }
  })
})

describe('the site home page leads the same way', () => {
  it('has the headline as its h1 and the rooms for workflows, the playbook, the tools and the Preview before the office at work', () => {
    const h1 = home.match(/<h1>([\s\S]*?)<\/h1>/)?.[1] ?? ''
    expect(h1).toContain('skip the process')
    const at = (id: string) => home.indexOf(`id="${id}"`)
    for (const id of ['workflows', 'playbook', 'tools', 'preview']) expect(at(id), id).toBeGreaterThan(-1)
    expect(at('workroom')).toBeGreaterThan(at('preview'))
  })

  it('keeps the building the crew builds the page from under the headline, where the animation expects it, and before the story', () => {
    expect(home.indexOf('class="facade"')).toBeGreaterThan(home.indexOf('<h1>'))
    expect(home.indexOf('class="facade"')).toBeLessThan(home.indexOf('id="story"'))
  })

  it('says the holds are a guard rail and not a lock', () => {
    expect(home).toMatch(/guard rail, not a lock/)
  })
})

describe('the crew builds every part of the page, the new ones too', () => {
  const css = read('site/site.css')
  const js = read('site/office.js')
  const fromJs = (js.match(/const PART_SELECTORS = '([^']+)'/)?.[1] ?? '').split(',').map((x) => x.trim())
  const fromCss = (css.match(/html\.building :is\((.+?)\):not\(\.in\)/)?.[1] ?? '').split(',').map((x) => x.trim())

  it('has the same list of parts in the script and in the stylesheet that hides them until they are built', () => {
    expect(fromJs.length).toBeGreaterThan(10)
    expect(fromCss).toEqual(fromJs)
  })

  it.each(['.vs h2', '.vs li', '.pics img', '.pics figcaption', '.limit'])('builds %s', (selector) => {
    expect(fromJs).toContain(selector)
  })
})

describe('the crew has extra work to do on the new parts of the page', () => {
  const js = read('site/office.js')
  const known = (js.match(/const THEN_ACTIONS = \[([^\]]+)\]/)?.[1] ?? '').split(',').map((x) => x.trim().replace(/'/g, ''))
  const used = [...home.matchAll(/data-then="(\w+)"/g)].map((m) => m[1]!)

  it('marks parts with extra work, and only with work the crew knows', () => {
    expect(used.length).toBeGreaterThanOrEqual(3)
    for (const u of used) expect(known, u).toContain(u)
    for (const k of known) expect(used, k).toContain(k)
  })

  it('shows the marks again when the page is not being built, and draws them with CSS, not with letters', () => {
    const css = read('site/site.css')
    expect(css).toContain('.vs li::before')
    expect(css).toContain('html.building .vs li:not(.checked)::before')
  })
})

describe('the chat panel that restyles the page', () => {
  const css = read('site/site.css')
  const js = read('site/office.js')

  it('is on the page with the request in its message box, a send button and one chip for each look', () => {
    expect(home).toContain('class="chatpanel"')
    expect(home).toContain('Using the appearance tools, restyle the whole page, not only its colours, to look like')
    expect(home).toContain('id="look-send"')
    for (const idea of ['a shadcn-style minimal, clean UI in dark', 'warm paper with serif type', 'a maximalist look and design']) expect(home).toContain(idea)
  })

  it('shows each theme option as a small card of that theme, and has a callout the crew can put over them', () => {
    expect([...home.matchAll(/class="sw"/g)]).toHaveLength(3)
    expect(css).toContain('.callout')
    expect(js).toContain("'Try this!'")
    expect(js).toContain("'Send!'")
    expect(js).toContain("'Wohoo!'")
  })

  it.each(['minimal', 'paper', 'maximal'])('has a whole look for %s: its own type, shape and depth, not only colours', (id) => {
    const block = css.match(new RegExp(`html\\.look-${id}\\{([^}]+)\\}`))?.[1] ?? ''
    for (const token of ['--display', '--r', '--drop', '--bg', '--accent']) expect(block, `${id} ${token}`).toContain(token)
  })

  it('draws the Keep and Undo bar as the app does', () => {
    expect(css).toContain('.keepbar')
    expect(js).toContain('Undo')
    expect(js).toContain('keepLabel')
  })

  it('has the panel built by the crew, as a box', () => {
    expect(js.match(/const PART_SELECTORS = '([^']+)'/)?.[1]).toContain('.chatpanel')
    expect(css).toMatch(/html\.building :is\(.+\.chatpanel\):not\(\.in\)/)
  })
})

describe('every picture the README and the site show exists', () => {
  const readmeImages = [...readme.matchAll(/(?:src=|\]\()"?(docs\/images\/[^"')\s]+\.(?:png|gif|jpg|svg))/g)].map((m) => m[1]!)
  const homeImages = [...home.matchAll(/(?:src|poster)="assets\/(docs\/images\/[^"]+)"/g)].map((m) => m[1]!)
  it.each([...new Set([...readmeImages, ...homeImages])])('%s', (file) => {
    expect(existsSync(join(root, file))).toBe(true)
  })

  it('shows the real pictures of a run: the plan gate, the card that waits for Run, the Preview, the MCP servers', () => {
    for (const name of ['plan-gate.png', 'run-card.png', 'preview-agent-page.png', 'mcp-servers.png']) {
      expect(readme + home, name).toContain(name)
    }
  })
})
