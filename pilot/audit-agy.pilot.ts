import { appendFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { askAgy } from '../src/main/workflows/ask'
import { auditPrompt, parseAudit } from '../src/shared/audit'
import type { PlanReadback } from '../src/shared/plan'

/**
 * Does agy's small model, asked headlessly the way the app asks it, shown the plan and a diff, report what a person would want to know and stay quiet otherwise?
 *   PILOT=1 PILOT_MODEL=gemini-3.8-flash-low PILOT_REPS=3 npx vitest run -c vitest.pilot.config.ts pilot/audit-agy.pilot.ts
 * The calls are the app's own (auditPrompt, askClaude, parseAudit); only the diffs are written here, one per kind of finding and one clean.
 */
const ON = !!process.env.PILOT
const MODEL = process.env.PILOT_MODEL ?? 'gemini-3.8-flash-low'
const REPS = Number(process.env.PILOT_REPS ?? 3)
const REPORT = 'pilot-report-audit-agy.txt'

const plan: PlanReadback = {
  goal: 'Add a dark-mode toggle to Settings that is remembered between launches.',
  assumptions: [{ kind: 'given', text: 'The toggle lives in Settings.' }, { kind: 'guessed', text: 'The choice is saved in preferences.json.' }],
  outOfScope: ['A theme per project.', 'Changing the colours of the dark theme.'],
  questions: []
}
const patch = (path: string, add: string[]) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,3 +1,${3 + add.length} @@\n context\n${add.map((l) => `+${l}`).join('\n')}\n context\n`
const SETTINGS = patch('src/Settings.tsx', ['<Switch checked={prefs.dark} onChange={(dark) => set({ dark })} title="Dark mode" />'])
const SAVE = patch('src/main/prefs.ts', ["dark: typeof p.dark === 'boolean' ? p.dark : false,"])

const CASES: { name: string; diff: string; expect: 'nothing' | 'out-of-scope' | 'goal-unmet' | 'guess-wrong' }[] = [
  { name: 'clean', diff: SETTINGS + SAVE, expect: 'nothing' },
  { name: 'out of scope', diff: SETTINGS + SAVE + patch('src/projects.ts', ['export const themeFor = (project: string) => prefs.themes[project] ?? prefs.dark', 'export const setThemeFor = (project: string, dark: boolean) => (prefs.themes[project] = dark)']), expect: 'out-of-scope' },
  { name: 'goal not met', diff: patch('src/Settings.tsx', ['const [dark, setDark] = useState(false)', '<Switch checked={dark} onChange={setDark} title="Dark mode" />']), expect: 'goal-unmet' },
  { name: 'guess wrong', diff: SETTINGS + patch('src/theme.ts', ["export const saveDark = (d: boolean) => localStorage.setItem('dark', String(d))", "export const loadDark = () => localStorage.getItem('dark') === 'true'"]), expect: 'guess-wrong' }
]

describe.skipIf(!ON)('the audit with a real model', () => {
  it('finds each kind of thing, and reports nothing for a diff that matches the plan', async () => {
    writeFileSync(REPORT, `model ${MODEL}, ${REPS} reps per case\n`)
    let spent = 0
    for (const c of CASES) {
      let hit = 0
      let quiet = 0
      let failed = 0
      const kinds: string[] = []
      for (let i = 0; i < REPS; i++) {
        try {
          const r = await askAgy({ file: 'agy', prefix: [] }, MODEL, auditPrompt(plan, c.diff).prompt, { ...process.env })
          spent += r.tokens ?? 0
          const found = parseAudit(r.text)
          if (!found) failed++
          else {
            kinds.push(found.map((f) => f.kind).join('+') || 'none')
            if (!found.length) quiet++
            if (c.expect !== 'nothing' && found.some((f) => f.kind === c.expect)) hit++
          }
        } catch (e) {
          failed++
          kinds.push(`error: ${(e as Error).message}`)
        }
      }
      appendFileSync(REPORT, `${c.name} (expect ${c.expect}): hit ${hit}/${REPS}, said nothing ${quiet}/${REPS}, unreadable or error ${failed}. Replies: ${kinds.join(' | ')}\n`)
    }
    appendFileSync(REPORT, `tokens used: ${spent}\n`)
  })
})
