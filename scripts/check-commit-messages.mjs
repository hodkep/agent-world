#!/usr/bin/env node
// Commits here are written by people. A line that credits an AI tool (a Co-Authored-By trailer for Claude, a "Generated with Claude Code" line)
// is refused by the commit-msg hook, by CI on every push and pull request, and can be run by hand over any range.
//
//   node scripts/check-commit-messages.mjs --file <message file>   what git gives a commit-msg hook
//   node scripts/check-commit-messages.mjs <from>..<to>            commits in a range; a <from> of all zeros (a first push) checks <to> alone
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TRAILER = /^\s*co-authored-by:.*(claude|anthropic)/i
const GENERATED = /^\s*(🤖\s*)?generated with\b.*claude/i

/** The lines of a commit message that credit an AI tool. A message that only talks about Claude Code is fine. */
export function attributionLines(message) {
  return message.split(/\r?\n/).filter((line) => !line.startsWith('#') && (TRAILER.test(line) || GENERATED.test(line))).map((line) => line.trim())
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

function commitsIn(range) {
  const [from, to] = range.split('..')
  const args = !to ? ['-1', from] : /^0+$/.test(from) ? ['-1', to] : [range]
  return git('log', ...args, '--format=%h%x1f%B%x1e')
    .split('\x1e')
    .map((c) => c.replace(/^\n/, ''))
    .filter(Boolean)
    .map((c) => {
      const [sha, ...body] = c.split('\x1f')
      return { sha, message: body.join('\x1f') }
    })
}

function main(argv) {
  const file = argv[0] === '--file' ? argv[1] : undefined
  const found = file
    ? [{ sha: 'this commit', message: readFileSync(file, 'utf8') }]
    : argv[0]
      ? commitsIn(argv[0])
      : (console.error('usage: check-commit-messages.mjs --file <message file> | <from>..<to>'), process.exit(2))
  const bad = found.map((c) => ({ ...c, lines: attributionLines(c.message) })).filter((c) => c.lines.length)
  for (const c of bad) for (const line of c.lines) console.error(`${c.sha}: ${line}`)
  if (bad.length) {
    console.error('\nCommits in this project are not credited to an AI tool. Remove those lines from the message (git commit --amend, or git rebase -i to reword older commits).')
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
