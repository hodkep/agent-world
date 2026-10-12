import { describe, expect, it } from 'vitest'
import { auditPrompt, parseAudit } from './audit'
import type { PlanReadback } from './plan'

describe('reading the auditor\'s reply', () => {
  it('turns a JSON reply into findings with their kind, file and text', () => {
    const reply = '{"findings":[{"kind":"out-of-scope","file":"src/theme/palette.ts","text":"Adds a project key; the plan puts a theme per project out of scope."},{"kind":"guess-wrong","file":"src/prefs.ts","text":"Saved in localStorage; the plan guessed preferences.json."}]}'
    expect(parseAudit(reply)).toEqual([
      { kind: 'out-of-scope', file: 'src/theme/palette.ts', text: 'Adds a project key; the plan puts a theme per project out of scope.' },
      { kind: 'guess-wrong', file: 'src/prefs.ts', text: 'Saved in localStorage; the plan guessed preferences.json.' }
    ])
  })

  it('finds the JSON inside a code fence or after a sentence of prose', () => {
    const body = '{"findings":[{"kind":"goal-unmet","text":"Nothing saves the choice."}]}'
    const want = [{ kind: 'goal-unmet', text: 'Nothing saves the choice.' }]
    expect(parseAudit('```json\n' + body + '\n```')).toEqual(want)
    expect(parseAudit('Here is my review.\n' + body + '\nHope that helps.')).toEqual(want)
  })

  it('drops entries it cannot show: an unknown kind, no text, or not an object; trims the text and caps its length', () => {
    const long = 'x'.repeat(500)
    const reply = JSON.stringify({ findings: [{ kind: 'style', text: 'Use tabs.' }, { kind: 'goal-unmet', text: '   ' }, 'oops', null, { kind: 'out-of-scope', file: 42, text: `  ${long}  ` }, { kind: 'guess-wrong', text: ' kept ' }] })
    expect(parseAudit(reply)).toEqual([
      { kind: 'out-of-scope', text: 'x'.repeat(299) + '…' },
      { kind: 'guess-wrong', text: 'kept' }
    ])
  })

  it('keeps at most ten findings so a rambling reply cannot fill the dialog', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ kind: 'out-of-scope', text: `finding ${i}` }))
    expect(parseAudit(JSON.stringify({ findings: many }))!.map((f) => f.text)).toEqual(many.slice(0, 10).map((f) => f.text))
  })

  it('says null when the reply is not a findings list, and an empty list when the diff is clean', () => {
    expect(parseAudit('Looks good to me!')).toBeNull()
    expect(parseAudit('{"findings":"none"}')).toBeNull()
    expect(parseAudit('{"issues":[]}')).toBeNull()
    expect(parseAudit('{"findings":[]}')).toEqual([])
  })
})

const plan: PlanReadback = {
  goal: 'Add a dark-mode toggle to Settings.',
  assumptions: [{ kind: 'given', text: 'The toggle lives in Settings.' }, { kind: 'guessed', text: 'The choice is saved in preferences.json.' }],
  outOfScope: ['A theme per project.'],
  questions: []
}
const file = (path: string, body: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${body}\n`

describe('asking a model to review a diff against the plan', () => {
  it('gives it the goal, what is out of scope, each assumption with how sure it was, the diff, and the shape of the reply', () => {
    const diff = file('src/prefs.ts', '+export const dark = true')
    const { prompt, files, lines, truncated } = auditPrompt(plan, diff)
    for (const part of ['Add a dark-mode toggle to Settings.', 'A theme per project.', '[given] The toggle lives in Settings.', '[guessed] The choice is saved in preferences.json.', '+export const dark = true', '"findings"', 'out-of-scope', 'goal-unmet', 'guess-wrong']) expect(prompt).toContain(part)
    expect({ files, lines, truncated }).toEqual({ files: 1, lines: 5, truncated: false })
  })

  it('cuts a diff that is too big at a file boundary and says how much it showed, so a large change never fails the call', () => {
    const diff = ['a.ts', 'b.ts', 'c.ts'].map((f) => file(f, '+' + 'x'.repeat(100))).join('')
    const one = file('a.ts', '+' + 'x'.repeat(100)).length
    const r = auditPrompt(plan, diff, { maxBytes: one * 2 + 10 })
    expect(r).toMatchObject({ files: 2, truncated: true })
    expect(r.prompt).toContain('a.ts')
    expect(r.prompt).toContain('b.ts')
    expect(r.prompt).not.toContain('c.ts')
    expect(r.prompt).toContain('Only the first 2 of 3 files are shown')
  })
})
