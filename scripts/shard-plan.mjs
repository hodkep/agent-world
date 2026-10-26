#!/usr/bin/env node
// Which end-to-end spec files each CI shard runs. Playwright's own --shard splits by how many tests there are, not how long they take: one run had shards of 6.5, 12.3, 4.6 and 7.3 minutes
// (the slowest file alone, office-life, takes 5), and the run is as slow as its slowest shard. This deals the files out longest first to the shard with the least time so far, from the seconds
// each file took (e2e/durations.json, kept in step with `--update`, and the reports of the latest run when CI has them).
//
//   node scripts/shard-plan.mjs [--shards 4] [--reports report-1.json ...]      prints the matrix JSON (and adds matrix=... to $GITHUB_OUTPUT in CI)
//   node scripts/shard-plan.mjs --update report-1.json report-2.json ...         rewrites e2e/durations.json from those reports
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DURATIONS = 'e2e/durations.json'
const FALLBACK_SECONDS = 10

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : FALLBACK_SECONDS)

/** `files` dealt into `n` shards, the longest first to the shard with the least so far. A file with no time on record counts as the median of those that have one. Same plan for the same input, in any order. */
export function planShards(files, durations, n) {
  const mid = median(files.flatMap((f) => (durations[f] === undefined ? [] : [durations[f]])))
  const weight = (f) => durations[f] ?? mid
  const shards = Array.from({ length: n }, () => ({ load: 0, files: [] }))
  for (const f of [...files].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))) {
    const s = shards.reduce((best, x) => (x.load < best.load ? x : best))
    s.files.push(f)
    s.load += weight(f)
  }
  return shards.map((s) => s.files.sort())
}

/** The matrix the workflow's e2e job reads: a shard's number and its files on one line. */
export function matrixOf(shards) {
  return { include: shards.map((files, i) => ({ shard: i + 1, files: files.join(' ') })) }
}

/** Seconds per spec file from Playwright JSON reports: every attempt of every test that ran, averaged over the reports that hold the file. */
export function durationsFromReports(reports) {
  const sums = {}
  for (const r of reports) {
    const ms = {}
    const walk = (suite) => {
      for (const s of suite.specs ?? []) {
        const file = `e2e/${(s.file ?? suite.file ?? '').replace(/^e2e\//, '')}`
        for (const t of s.tests ?? []) if (t.status !== 'skipped') ms[file] = (ms[file] ?? 0) + (t.results ?? []).reduce((n, x) => n + (x.duration ?? 0), 0)
      }
      for (const c of suite.suites ?? []) walk(c)
    }
    for (const s of r.suites ?? []) walk(s)
    for (const [f, v] of Object.entries(ms)) (sums[f] ??= []).push(v)
  }
  return Object.fromEntries(Object.entries(sums).map(([f, v]) => [f, Math.round(v.reduce((a, b) => a + b, 0) / v.length / 1000)]))
}

const readReports = (paths) =>
  paths.flatMap((p) => {
    try {
      return [JSON.parse(readFileSync(p, 'utf8'))]
    } catch {
      return []
    }
  })

function main() {
  const args = process.argv.slice(2)
  const at = args.indexOf('--update')
  if (at >= 0) {
    const d = durationsFromReports(readReports(args.slice(at + 1)))
    writeFileSync(DURATIONS, JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n')
    return console.log(`${Object.keys(d).length} files written to ${DURATIONS}`)
  }
  const n = Number(args.includes('--shards') ? args[args.indexOf('--shards') + 1] : 4)
  let out
  try {
    const files = readdirSync('e2e').filter((f) => f.endsWith('.e2e.ts')).map((f) => `e2e/${f}`)
    const committed = existsSync(DURATIONS) ? JSON.parse(readFileSync(DURATIONS, 'utf8')) : {}
    const at = args.indexOf('--reports')
    const latest = at >= 0 ? durationsFromReports(readReports(args.slice(at + 1))) : {}
    out = matrixOf(planShards(files, { ...committed, ...latest }, n))
  } catch (e) {
    // The job that reads this falls back to Playwright's own split when a shard has no files.
    console.error(`No plan: ${e.message}`)
    out = { include: Array.from({ length: n }, (_, i) => ({ shard: i + 1, files: '' })) }
  }
  const line = JSON.stringify(out)
  console.log(line)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${line}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
