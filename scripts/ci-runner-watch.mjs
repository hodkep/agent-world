#!/usr/bin/env node
// Says so on the pull request when the end-to-end jobs have no Mac after a few minutes, instead of leaving it to wait 15 minutes and be abandoned.
// GitHub's macOS pool has run short: 3 of the last 30 runs had e2e jobs that never started. This job runs beside them, on Linux, and only watches.
//
//   node scripts/ci-runner-watch.mjs     reads GH_TOKEN, REPO, RUN_ID, PR, SHA from the environment; GRACE_MINUTES (default 5)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const MARKER = '<!-- e2e-no-mac -->'

/** The names of end-to-end jobs still queued (no Mac picked them up) after `graceMs` of waiting. A job that started, finished or was cancelled is not waiting. */
export function waiting(jobs, now, graceMs) {
  return jobs.filter((j) => /^e2e\b/.test(j.name) && j.status === 'queued' && !j.started_at && now - Date.parse(j.created_at) >= graceMs).map((j) => j.name)
}

/** The comment and the step summary: what is stuck, how long, and what the owner can do with a Mac of their own. */
export function notice({ names, minutes, runUrl, sha }) {
  return [
    MARKER,
    '## End-to-end jobs have no Mac',
    '',
    `${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} not been picked up by a macOS runner after ${minutes} minutes (head \`${sha}\`). GitHub's macOS pool is short; [the run](${runUrl}) keeps waiting and may be abandoned at 15 minutes.`,
    '',
    'Evidence from a Mac of your own, a subset with CI\'s settings (the specs of the changed area, the touched specs and the canaries), posted on this pull request:',
    '',
    '```',
    'pnpm verify:local --comment',
    '```',
    '',
    'Whether to merge on that evidence or to re-run the jobs later is the owner\'s call.',
    ''
  ].join('\n')
}

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', env: process.env })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { REPO, RUN_ID, PR, SHA = '', GRACE_MINUTES = '5' } = process.env
  const graceMs = Number(GRACE_MINUTES) * 60_000
  const deadline = Date.now() + graceMs + 15 * 60_000
  const runUrl = `https://github.com/${REPO}/actions/runs/${RUN_ID}`
  while (Date.now() < deadline) {
    let jobs = []
    try {
      jobs = JSON.parse(gh('api', `repos/${REPO}/actions/runs/${RUN_ID}/jobs?per_page=100`)).jobs
    } catch (e) {
      console.error(`Could not read the jobs: ${e.message}`)
    }
    const e2e = jobs.filter((j) => /^e2e\b/.test(j.name))
    const checks = jobs.find((j) => j.name === 'checks')
    // The end-to-end jobs are made once the fast checks pass; when those fail there will be none to watch.
    if (e2e.length === 0 && checks?.status === 'completed' && checks.conclusion !== 'success') return console.log('The fast checks did not pass, so no end-to-end jobs follow.')
    if (e2e.length > 0 && e2e.every((j) => j.status !== 'queued')) return console.log('Every end-to-end job has a Mac.')
    const names = waiting(jobs, Date.now(), graceMs)
    if (names.length > 0) {
      const md = notice({ names, minutes: Number(GRACE_MINUTES), runUrl, sha: SHA.slice(0, 7) })
      console.log(md)
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
      try {
        // One comment, updated: a re-run of the jobs says it again without piling up.
        const id = gh('api', `repos/${REPO}/issues/${PR}/comments`, '--jq', `[.[] | select(.body | contains("${MARKER}")) | .id][0] // empty`).trim()
        if (id) gh('api', '--method', 'PATCH', `repos/${REPO}/issues/comments/${id}`, '-f', `body=${md}`)
        else gh('api', '--method', 'POST', `repos/${REPO}/issues/${PR}/comments`, '-f', `body=${md}`)
      } catch (e) {
        // A pull request from a fork has a read-only token: the step summary above still says it.
        console.error(`Could not comment on the pull request: ${e.message}`)
      }
      return
    }
    await sleep(30_000)
  }
  console.log('Stopped watching without finding a job that waits.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
