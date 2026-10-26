import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Library } from './store'
import { INLINE_MAX, Playbooks, compile, merge } from './playbook'
import { FORMS_ID, VISUALS_ID, syncVisuals } from './visuals'

const root = () => join(mkdtempSync(join(tmpdir(), 'aw-visuals-')), 'library')

describe('what agents are told about drawing in the chat, as library items', () => {
  it('is two built-in instructions: a short one that is always on, and the form format, read when a form is needed', async () => {
    const r = root()
    syncVisuals({ root: r })
    const lib = new Library(r)
    const short = (await lib.get(VISUALS_ID))!
    const forms = (await lib.get(FORMS_ID))!
    expect([short.kind, short.source, forms.kind, forms.source]).toEqual(['instruction', 'built-in', 'instruction', 'built-in'])
    expect(short.body).toMatch(/```mermaid/)
    expect(short.body).toMatch(/without being asked/)
    expect(short.body).toMatch(/ASCII/)
    expect(short.body).toContain(FORMS_ID)
    // Short enough to go into the opening text itself, not to be read first with a tool.
    expect(short.tokens.body).toBeLessThanOrEqual(INLINE_MAX)
    expect(forms.body).toMatch(/```a2ui/)
    for (const c of ['Button', 'TextField', 'ChoicePicker', 'Slider', 'CheckBox', 'updateDataModel']) expect(forms.body).toContain(c)
  })

  it('puts two rules in the Everywhere playbook once: the short one always, the format when a form is needed; and they stay out if the person took them out', () => {
    const r = root()
    syncVisuals({ root: r })
    syncVisuals({ root: r })
    const playbooks = new Playbooks(r)
    const rules = playbooks.read('global')
    expect(rules.filter((x) => x.id === VISUALS_ID)).toEqual([{ id: VISUALS_ID, mode: 'always', when: '', strength: 'soft' }])
    expect(rules.filter((x) => x.id === FORMS_ID)).toHaveLength(1)
    expect(rules.find((x) => x.id === FORMS_ID)).toMatchObject({ mode: 'on-demand', strength: 'soft' })
    playbooks.write('global', [])
    syncVisuals({ root: r })
    expect(playbooks.read('global')).toEqual([])
  })

  it('reaches an agent: the opening text holds the short rule and points at the format', async () => {
    const r = root()
    syncVisuals({ root: r })
    const items = new Map((await new Library(r).list()).map((i) => [i.id, i]))
    const text = compile(merge(new Playbooks(r).read('global')), items, { canFetch: true })
    expect(text.core).toContain('```mermaid')
    expect(text.core).toContain(`library_get`)
    expect(text.core).toContain(FORMS_ID)
    expect(text.overBudget).toBe(false)
  })

  it('is rewritten when the app ships new wording, and left alone when nothing changed', () => {
    const r = root()
    syncVisuals({ root: r })
    const file = join(r, 'instructions', `${VISUALS_ID}.md`)
    writeFileSync(file, 'old words')
    syncVisuals({ root: r })
    expect(readFileSync(file, 'utf8')).toMatch(/mermaid/)
    const before = readFileSync(file, 'utf8')
    syncVisuals({ root: r })
    expect(readFileSync(file, 'utf8')).toBe(before)
  })
})
