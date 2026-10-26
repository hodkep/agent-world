#!/usr/bin/env node
// A pull request's end-to-end evidence from this Mac, for when GitHub has none to give. It runs a SUBSET, never the whole suite, with the settings CI uses (CI=1: two workers,
// a retry, the longer timeout): the specs of the area the diff is in, every spec file the diff touches, and a fixed set of canaries that cross-cutting changes have broken without
// touching them (agy, clone, controls, quit, preview-narrow broke on one change that touched none of them).
//
//   pnpm verify:local                 build, run the subset, print a summary
//   pnpm verify:local --dry-run       only say which specs it would run
//   pnpm verify:local --comment       also post the summary on this branch's pull request (outward-facing, so only when asked)
//   options: --base <ref> (default origin/main), --max-area <n> (default 12), --workers <n> (default 2)
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** One spec file per cross-cutting concern, plus the ones a change to shared code has broken before. */
export const CANARIES = ['agy', 'clone', 'controls', 'quit', 'preview-narrow', 'wrapup', 'messaging', 'library', 'chat', 'workflows-defs', 'office-calm', 'terminal-drawer']

// Words of a path that name a layer, not a feature: a file's own name is only a clue when it is not one of these.
const STOP = new Set(['src', 'main', 'renderer', 'shared', 'preload', 'index', 'app', 'service', 'panel', 'store', 'types', 'type', 'util', 'utils', 'use', 'api', 'styles', 'test', 'view', 'hook', 'hooks', 'e2e', 'ts', 'tsx', 'mjs', 'css', 'run', 'agent', 'item', 'list', 'tab', 'add', 'hint', 'menu', 'editor', 'viewer', 'context', 'config', 'dom', 'live', 'mark', 'icon', 'group', 'step', 'gate', 'flow'])

const words = (s) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))

const specName = (f) => f.replace(/^e2e\//, '').replace(/\.e2e\.ts$/, '')

/** Which spec files check a diff. `all` is every spec file there is; the result never holds one that is not in it. */
export function planSpecs(changed, all, { maxArea = 12 } = {}) {
  const have = new Set(all)
  const reasons = []
  const touched = changed.filter((f) => /^e2e\/[^/]+\.e2e\.ts$/.test(f) && have.has(f))
  // A spec that several changed files point at comes before one that a single file does, so the cap keeps the most related.
  const score = new Map()
  for (const f of changed.filter((f) => /^src\//.test(f) && !/\.test\.tsx?$/.test(f))) {
    const keys = new Set(f.split('/').flatMap((seg) => words(seg.replace(/\.[a-z]+$/, ''))).filter((w) => !STOP.has(w)))
    const hit = all.filter((s) => words(specName(s).replace(/-/g, ' ')).some((w) => keys.has(w)))
    if (hit.length === 0) reasons.push(`${f.split('/').pop()}: no spec is named for it, so the canaries cover it`)
    else (hit.forEach((s) => score.set(s, (score.get(s) ?? 0) + 1)), reasons.push(`${f.split('/').pop()}: ${hit.length} specs by name (${[...keys].join(', ')})`))
  }
  const area = [...score.keys()]
  const canaries = CANARIES.map((c) => `e2e/${c}.e2e.ts`).filter((s) => have.has(s))
  const fixed = new Set([...touched, ...canaries])
  const extra = area.filter((s) => !fixed.has(s)).sort((a, b) => score.get(b) - score.get(a) || a.localeCompare(b))
  const specs = [...new Set([...touched, ...extra.slice(0, maxArea), ...canaries])]
  return { specs, left: Math.max(0, extra.length - maxArea), reasons }
}

const fileOf = (f) => (f.includes('/') ? f : `e2e/${f}`)

/** Passed, flaky (passed on a retry) and failed spec counts of Playwright JSON reports, in all and per file; skipped specs are not counted. */
export function tally(reports) {
  const out = { files: {}, passed: 0, flaky: 0, failed: 0 }
  const walk = (suite) => {
    for (const s of suite.specs ?? []) {
      const st = (s.tests ?? []).map((t) => t.status).filter((x) => x !== 'skipped')
      if (st.length === 0) continue
      const key = st.includes('unexpected') ? 'failed' : st.includes('flaky') ? 'flaky' : 'passed'
      const file = (out.files[fileOf(s.file ?? suite.file ?? '')] ??= { passed: 0, flaky: 0, failed: 0 })
      file[key]++
      out[key]++
    }
    for (const c of suite.suites ?? []) walk(c)
  }
  for (const r of reports) for (const s of r.suites ?? []) walk(s)
  return out
}

/** The summary printed at the end and posted as a pull request comment. It says what it is: this Mac's run of a subset, not CI. */
export function report({ sha, base, specs, left, tally: t, minutes, workers }) {
  const bad = Object.entries(t.files).filter(([, c]) => c.failed || c.flaky)
  const lines = [
    '## End-to-end on a local Mac (not a CI run)',
    '',
    `Head \`${sha}\` against \`${base}\`. ${specs.length} spec files, ${t.passed} passed, ${t.flaky} flaky (passed on the retry), ${t.failed} failed. CI settings: CI=1, ${workers} workers, one retry; ${minutes.toFixed(1)} minutes.`,
    '',
    'A subset on purpose: the specs named for the changed area, the spec files this change touches, and the canaries that cross-cutting changes have broken before. The full suite is the CI run.',
    left ? `${left} more specs of the changed area were left out by the cap; run them by name if the change reaches them.` : '',
    '',
    '<details><summary>Spec files run</summary>',
    '',
    ...specs.map((s) => `- ${s}`),
    '',
    '</details>'
  ]
  if (bad.length) lines.push('', 'Not clean:', '', ...bad.map(([f, c]) => `- ${f}: ${c.failed} failed, ${c.flaky} flaky`))
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n') + '\n'
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, d) => (args.includes(name) ? args[args.indexOf(name) + 1] : d)
  const base = opt('--base', 'origin/main')
  const workers = opt('--workers', '2')
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
  const mergeBase = git('merge-base', 'HEAD', base)
  // Commits since the base and what is not committed yet: the work as it stands.
  const changed = git('diff', '--name-only', mergeBase).split('\n').filter(Boolean)
  const all = readdirSync('e2e').filter((f) => f.endsWith('.e2e.ts')).map((f) => `e2e/${f}`)
  const plan = planSpecs(changed, all, { maxArea: Number(opt('--max-area', '12')) })
  console.log(`${changed.length} files changed against ${base}.\n${plan.reasons.map((r) => `  ${r}`).join('\n')}\n${plan.specs.length} spec files to run${plan.left ? ` (${plan.left} more of the area left out by the cap)` : ''}:`)
  for (const s of plan.specs) console.log(`  ${s}`)
  if (args.includes('--dry-run')) return
  const run = (cmd, a, env = {}) => spawnSync(cmd, a, { stdio: 'inherit', env: { ...process.env, ...env } })
  if (run('pnpm', ['run', 'build']).status !== 0) process.exit(1)
  const out = join(mkdtempSync(join(tmpdir(), 'aw-verify-')), 'report.json')
  const t0 = Date.now()
  const res = run('pnpm', ['exec', 'playwright', 'test', ...plan.specs, `--workers=${workers}`], { CI: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: out })
  let reports = []
  try {
    reports = [JSON.parse(readFileSync(out, 'utf8'))]
  } catch {
    console.error('No report was written, so the summary has no counts.')
  }
  const md = report({ sha: git('rev-parse', '--short', 'HEAD'), base, specs: plan.specs, left: plan.left, tally: tally(reports), minutes: (Date.now() - t0) / 60000, workers })
  console.log(`\n${md}`)
  if (args.includes('--comment')) {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-verify-')), 'comment.md')
    writeFileSync(file, md)
    const pr = spawnSync('gh', ['pr', 'comment', '--body-file', file], { stdio: 'inherit' })
    if (pr.status !== 0) console.error('Could not post the comment (is there a pull request for this branch, and is gh signed in?). The summary is above.')
  }
  process.exit(res.status ?? 1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
