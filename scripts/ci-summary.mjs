#!/usr/bin/env node
// The end-to-end run, one report per shard, as a step summary: which specs only passed on a retry, and which took longest, so the slow ones can be trimmed.
//
//   node scripts/ci-summary.mjs report-1.json report-2.json ...    markdown on stdout (CI appends it to $GITHUB_STEP_SUMMARY)
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TOP = 10

/** Every spec of a Playwright JSON report, with how long all its attempts took and whether it passed only on a retry. */
function specsOf(suite, out = []) {
  for (const s of suite.specs ?? []) {
    const tests = (s.tests ?? []).filter((t) => t.status !== 'skipped')
    if (tests.length === 0) continue
    const ms = tests.reduce((sum, t) => sum + (t.results ?? []).reduce((n, r) => n + (r.duration ?? 0), 0), 0)
    out.push({ name: `${s.file ?? suite.file} › ${s.title}`, ms, flaky: tests.some((t) => t.status === 'flaky') })
  }
  for (const child of suite.suites ?? []) specsOf(child, out)
  return out
}

export function summarize(reports) {
  const specs = reports.flatMap((r) => (r.suites ?? []).flatMap((s) => specsOf(s)))
  if (specs.length === 0) return '## End-to-end\n\nNo end-to-end report was written.\n'
  const flaky = specs.filter((s) => s.flaky)
  const slowest = [...specs].sort((a, b) => b.ms - a.ms).slice(0, TOP)
  const lines = ['## End-to-end', '', `${specs.length} specs ran.`, '']
  lines.push(flaky.length ? `### Flaky (${flaky.length})\n\nPassed only on a retry:\n\n${flaky.map((s) => `- ${s.name}`).join('\n')}` : '### Flaky\n\nNo flaky specs.')
  lines.push('', `### Slowest ${slowest.length}`, '', '| # | Spec | Time |', '| - | - | - |')
  slowest.forEach((s, i) => lines.push(`| ${i + 1} | ${s.name} | ${(s.ms / 1000).toFixed(1)} s |`))
  return lines.join('\n') + '\n'
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const reports = process.argv.slice(2).flatMap((f) => {
    try {
      return [JSON.parse(readFileSync(f, 'utf8'))]
    } catch {
      return []
    }
  })
  process.stdout.write(summarize(reports))
}
