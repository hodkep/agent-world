#!/usr/bin/env node
// Whether a pull request changed anything the end-to-end run could notice. Docs, the changelog and pictures cannot, and the run is 20 minutes on four Macs.
//
//   git diff --name-only base...head | node scripts/ci-changes.mjs     prints code=true or code=false (and adds it to $GITHUB_OUTPUT in CI)
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const DOC = /(^|\/)(LICENSE[^/]*|[^/]+\.md)$|^docs\/|^\.github\/ISSUE_TEMPLATE\//
// A picture under src/ is part of the app; elsewhere (docs, the app icon in build/) nothing runs it.
const PICTURE = /^(?!src\/).*\.(png|jpe?g|gif|svg)$/i

/** True when any changed file is code, or when nothing is listed (a diff that failed must not skip the tests). */
export function touchesCode(files) {
  if (files.length === 0) return true
  return files.some((f) => !DOC.test(f) && !PICTURE.test(f))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const files = readFileSync(0, 'utf8').split(/\r?\n/).filter(Boolean)
  const line = `code=${touchesCode(files)}`
  console.log(line)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
}
