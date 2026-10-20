#!/usr/bin/env node
// The required check passes only if every job before it succeeded or was left out on purpose (skipped). A job that never got a Mac is marked
// "abandoned", not "failure", and a rule that only looked for failure and cancelled let it through: the check was green with no end-to-end run.
//
//   node scripts/ci-needs.mjs "success success skipped"     exits 1 unless every result is success or skipped
import { pathToFileURL } from 'node:url'

export function allPassed(results) {
  const list = results.trim().split(/\s+/).filter(Boolean)
  return list.length > 0 && list.every((r) => r === 'success' || r === 'skipped')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const results = process.argv[2] ?? ''
  console.log(`Results: ${results}`)
  if (!allPassed(results)) {
    console.error('A job before this one did not succeed (and was not skipped on purpose).')
    process.exit(1)
  }
}
