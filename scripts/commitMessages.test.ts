import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error a plain .mjs script, shared by the hook, the check and CI
import { attributionLines } from './check-commit-messages.mjs'

const script = join(__dirname, 'check-commit-messages.mjs')
const claudeTrailer = 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'

describe('which lines of a commit message credit an AI tool', () => {
  it('finds a Co-Authored-By trailer naming Claude, whatever the model or letter case', () => {
    expect(attributionLines(`fix(chat): a thing\n\n${claudeTrailer}\n`)).toEqual([claudeTrailer])
    expect(attributionLines('x\n\nco-authored-by: claude <claude@users.noreply.github.com>')).toHaveLength(1)
    expect(attributionLines('x\n\nCo-authored-by: Claude Opus 4.1 <noreply@anthropic.com>')).toHaveLength(1)
  })

  it('finds a trailer by the Anthropic address even when the name does not say Claude', () => {
    expect(attributionLines('x\n\nCo-Authored-By: Assistant <noreply@anthropic.com>')).toHaveLength(1)
  })

  it('finds the "Generated with Claude Code" line, with or without the robot and the link', () => {
    expect(attributionLines('x\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')).toHaveLength(1)
    expect(attributionLines('x\n\nGenerated with Claude Code')).toHaveLength(1)
  })

  it('leaves a person as a co-author alone', () => {
    expect(attributionLines('x\n\nCo-Authored-By: Ada Lovelace <ada@example.com>')).toEqual([])
  })

  it('leaves a message that merely talks about Claude Code alone, in the subject or the body', () => {
    expect(attributionLines("fix(chat): Claude Code's first-run questions are answered in setup\n\nClaude asks once whether to trust the folder.")).toEqual([])
    expect(attributionLines('docs: the app is not affiliated with Anthropic')).toEqual([])
  })

  it('returns every offending line, not just the first', () => {
    expect(attributionLines(`x\n\n${claudeTrailer}\n🤖 Generated with Claude Code\n`)).toHaveLength(2)
  })
})

const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' })
const repoWith = (...messages: string[]) => {
  const cwd = mkdtempSync(join(tmpdir(), 'aw-msgs-'))
  git(cwd, 'init', '-q', '-b', 'main')
  for (const m of messages) git(cwd, 'commit', '-q', '--allow-empty', '-m', m)
  return cwd
}
const check = (cwd: string, ...args: string[]) => spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' })

describe('the check command', () => {
  it('passes a range of clean commits and exits 0', () => {
    const cwd = repoWith('feat(a): one', 'fix(b): two')
    expect(check(cwd, 'HEAD~1..HEAD').status).toBe(0)
  })

  it('fails a range holding a credited commit, naming the commit and the line', () => {
    const cwd = repoWith('feat(a): one', `fix(b): two\n\n${claudeTrailer}`)
    const r = check(cwd, 'HEAD~1..HEAD')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain(git(cwd, 'rev-parse', '--short', 'HEAD').stdout.trim())
    expect(r.stderr).toContain(claudeTrailer)
  })

  it('does not look at commits outside the range', () => {
    const cwd = repoWith(`old\n\n${claudeTrailer}`, 'feat(a): clean')
    expect(check(cwd, 'HEAD~1..HEAD').status).toBe(0)
  })

  it('checks the message file git hands to a commit-msg hook', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'aw-msgfile-'))
    const bad = join(cwd, 'MSG')
    writeFileSync(bad, `feat: x\n\n${claudeTrailer}\n`)
    expect(check(cwd, '--file', bad).status).toBe(1)
    writeFileSync(bad, 'feat: x\n')
    expect(check(cwd, '--file', bad).status).toBe(0)
  })

  it('checks only the last commit when asked for a range that cannot exist (a first push has no earlier state)', () => {
    const cwd = repoWith(`old\n\n${claudeTrailer}`, 'feat(a): clean')
    expect(check(cwd, '0000000000000000000000000000000000000000..HEAD').status).toBe(0)
  })
})
