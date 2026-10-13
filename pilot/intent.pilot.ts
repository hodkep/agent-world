import { appendFileSync, writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { askAgy, askClaude } from '../src/main/workflows/ask'
import { intentPrompt, parseIntent } from '../src/shared/intent'
import type { PlanReadback } from '../src/shared/plan'

/**
 * Does a real small model, shown a request and the agent's plan, name the gap the plan missed, and stay quiet when the request is clear?
 *   PILOT=1 PILOT_MODEL=haiku PILOT_REPS=2 npx vitest run -c vitest.pilot.config.ts pilot/intent.pilot.ts
 * 10 clear requests whose plan covers them, 10 requests with one hidden gap the plan does not mention. The plans are written here, short
 * and plausible; a gap the plan lists as an assumption would not count as new, so the gap cases leave it out. A hit is a gap whose
 * question matches words about the hidden gap.
 */
const ON = !!process.env.PILOT
// PILOT_PROGRAM=agy asks agy (PILOT_MODEL then names one of its models) instead of claude.
const PROGRAM = process.env.PILOT_PROGRAM === 'agy' ? 'agy' : 'claude'
const MODEL = process.env.PILOT_MODEL ?? (PROGRAM === 'agy' ? 'gemini-3.8-flash-low' : 'haiku')
const REPS = Number(process.env.PILOT_REPS ?? 2)
const REPORT = PROGRAM === 'agy' ? 'pilot-report-intent-agy.txt' : 'pilot-report-intent.txt'

const plan = (goal: string, given: string[], out: string[] = []): PlanReadback => ({ goal, assumptions: given.map((text) => ({ kind: 'given' as const, text })), outOfScope: out, questions: [] })

const CLEAR: { request: string; plan: PlanReadback }[] = [
  { request: 'Rename the function getUserName to fetchUserName everywhere in src/.', plan: plan('Rename getUserName to fetchUserName in src/.', ['Every call site and import in src/ is updated.', 'The function keeps its behaviour.'], ['Other directories.']) },
  { request: 'Add a --verbose flag to the CLI that prints each file as it is processed to stderr.', plan: plan('Add a --verbose flag that prints each processed file to stderr.', ['The flag is off by default.', 'Output goes to stderr, one path per line.']) },
  { request: "Fix the typo 'recieve' to 'receive' in README.md.", plan: plan("Correct 'recieve' to 'receive' in README.md.", ['Only README.md is touched.']) },
  { request: 'Bump the axios dependency in package.json to 1.7.2 and run the tests.', plan: plan('Upgrade axios to 1.7.2 and confirm the tests pass.', ['package.json and the lockfile change.', 'The existing test command is used.']) },
  { request: 'Add a unit test for slugify covering empty string, unicode, and repeated dashes.', plan: plan('Add slugify unit tests for empty string, unicode and repeated dashes.', ['The existing test framework is used.', 'slugify itself is not changed.']) },
  { request: 'Make the Save button in the profile form disabled while the request is in flight.', plan: plan('Disable the profile form Save button during the save request.', ['It re-enables when the request ends, successfully or not.']) },
  { request: 'Delete the unused file src/legacy/oldHelper.ts.', plan: plan('Remove src/legacy/oldHelper.ts.', ['Nothing imports it; this is checked first.']) },
  { request: 'Change the default page size from 20 to 50 in the list API.', plan: plan('Set the list API default page size to 50.', ['An explicit page size from the caller still wins.']) },
  { request: 'Add a /healthz endpoint that returns 200 and the text ok.', plan: plan('Add GET /healthz returning 200 with body ok.', ['No authentication on the endpoint.']) },
  { request: 'Log a warning when the config file is missing instead of throwing.', plan: plan('Warn instead of throwing when the config file is missing.', ['Defaults are used after the warning.']) }
]

const GAP: { request: string; plan: PlanReadback; hit: RegExp }[] = [
  { request: 'Add caching to the product list.', plan: plan('Cache the product list.', ['The list endpoint is the one to speed up.'], ['Other endpoints.']), hit: /ttl|expir|invalidat|how long|redis|memory|where|stale|fresh/i },
  { request: 'Let users export their data.', plan: plan('Add a data export for users.', ['It is reachable from the account page.']), hit: /format|csv|json|which data|what data|scope|include/i },
  { request: 'Make the login more secure.', plan: plan('Harden the login flow.', ['Existing users keep their accounts.']), hit: /mfa|2fa|two-factor|rate|lockout|password|polic|secur.*(mean|which|what)|which|what/i },
  { request: 'Add pagination to the orders page.', plan: plan('Paginate the orders page.', ['The orders API supports limits.']), hit: /page size|per page|infinite|cursor|offset|how many|numbered|load more/i },
  { request: 'Send an email when an order ships.', plan: plan('Email the customer when an order ships.', ['The shipping event already exists.']), hit: /template|provider|service|content|wording|sender|from address|recipient|smtp|which email/i },
  { request: 'Support dark mode.', plan: plan('Add a dark theme to the app.', ['Colours come from the existing theme tokens.']), hit: /system|toggle|manual|prefer|persist|automatic|follow|os setting/i },
  { request: 'Clean up the old users.', plan: plan('Remove old user records.', ['The users table is the only place they live.']), hit: /old|inactive|delete|archive|soft|criteria|how long|define|what counts/i },
  { request: 'Add search to the docs site.', plan: plan('Add search to the docs site.', ['A search box goes in the header.']), hit: /client|server|algolia|index|fuzzy|scope|which|engine|library|full-text/i },
  { request: 'Translate the app to Spanish.', plan: plan('Add a Spanish translation of the app.', ['Strings are in the existing locale files.']), hit: /spain|mexico|latin|variant|dialect|es-|which (strings|text)|library|i18n|machine|professional|formal|tú|usted/i },
  { request: 'Improve the performance of the report page.', plan: plan('Make the report page faster.', ['The page is slow on large reports.']), hit: /metric|target|measure|bottleneck|which part|load time|query|how fast|slow|goal/i }
]

describe.skipIf(!ON)('the intent check with a real model', () => {
  it('names the hidden gap, and says little when the request is clear', async () => {
    writeFileSync(REPORT, `model ${MODEL}, ${REPS} reps per request\n`)
    let spent = 0
    const ask = async (request: string, p: PlanReadback) => {
      const r = PROGRAM === 'agy' ? await askAgy({ file: 'agy', prefix: [] }, MODEL, intentPrompt(request, p).prompt, { ...process.env }) : await askClaude({ file: 'claude', prefix: [] }, MODEL, intentPrompt(request, p).prompt, { ...process.env })
      spent += r.cost ?? 0
      return parseIntent(r.text)
    }
    let clearCalls = 0
    let clearQuiet = 0
    let clearAsked = 0
    for (const c of CLEAR) {
      const counts: number[] = []
      for (let i = 0; i < REPS; i++) {
        const gaps = await ask(c.request, c.plan).catch(() => null)
        clearCalls++
        if (gaps && gaps.length === 0) clearQuiet++
        clearAsked += gaps?.length ?? 0
        counts.push(gaps?.length ?? -1)
      }
      appendFileSync(REPORT, `clear: "${c.request}" gaps per rep: ${counts.join(', ')}\n`)
    }
    let gapCalls = 0
    let hits = 0
    let anyGap = 0
    for (const c of GAP) {
      let h = 0
      const seen: string[] = []
      for (let i = 0; i < REPS; i++) {
        const gaps = await ask(c.request, c.plan).catch(() => null)
        gapCalls++
        if (gaps?.length) anyGap++
        if (gaps?.some((g) => c.hit.test(g.text + ' ' + g.options.join(' ')))) (h++, hits++)
        seen.push((gaps ?? []).map((g) => g.text).join(' / ') || '(none)')
      }
      appendFileSync(REPORT, `gap: "${c.request}" hit ${h}/${REPS}. Asked: ${seen.join(' || ')}\n`)
    }
    appendFileSync(REPORT, `\nclear requests: stayed quiet ${clearQuiet}/${clearCalls}, ${clearAsked} questions wasted in total\ngap requests: the hidden gap named ${hits}/${gapCalls}, asked something ${anyGap}/${gapCalls}\nspent $${spent.toFixed(4)}\n`)
  })
})
