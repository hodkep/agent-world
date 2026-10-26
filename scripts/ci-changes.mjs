#!/usr/bin/env node
// Whether a pull request changed anything the end-to-end run could notice. Docs, the changelog and pictures cannot, and the run is 20 minutes on four Macs.
//
//   git diff --name-only base...head | node scripts/ci-changes.mjs     prints code=true or code=false (and adds it to $GITHUB_OUTPUT in CI)
//   ... | node scripts/ci-changes.mjs before-package.json after-package.json     the same, and package.json counts as a doc when only its "version" differs (a release pull request)
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DOC = /(^|\/)(LICENSE[^/]*|[^/]+\.md)$|^docs\/|^\.github\/ISSUE_TEMPLATE\//
// A picture under src/ is part of the app; elsewhere (docs, the app icon in build/) nothing runs it.
const PICTURE = /^(?!src\/).*\.(png|jpe?g|gif|svg)$/i

/** True when any changed file is code, or when nothing is listed (a diff that failed must not skip the tests). `packageVersionOnly` says package.json changed in its "version" alone. */
export function touchesCode(files, { packageVersionOnly = false } = {}) {
  if (files.length === 0) return true
  return files.some((f) => !DOC.test(f) && !PICTURE.test(f) && !(packageVersionOnly && f === 'package.json'))
}

/** Whether two texts of package.json differ in the "version" and nothing else. A text that is not JSON never counts, so a failure runs the tests. */
export function onlyVersionChanged(before, after) {
  try {
    const { version: _a, ...a } = JSON.parse(before)
    const { version: _b, ...b } = JSON.parse(after)
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean)
  const [before, after] = process.argv.slice(2)
  const read = (f) => (f ? readFileSync(f, 'utf8') : '')
  const line = `code=${touchesCode(files, { packageVersionOnly: !!before && !!after && onlyVersionChanged(read(before), read(after)) })}`
  console.log(line)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
}
