import { describe, expect, it } from 'vitest'
import { gitKind, gitKindOfEvent } from './gitCourier'

describe('what a command is, as far as the git courier cares', () => {
  it('knows a commit, a push and a pull request', () => {
    expect(gitKind('git commit -m "fix the thing"')).toBe('commit')
    expect(gitKind('git -C ../repo commit --amend')).toBe('commit')
    expect(gitKind('git push -u origin HEAD')).toBe('push')
    expect(gitKind('gh pr create --title x --body y')).toBe('pr')
  })

  it('takes the biggest thing in a chain: the push after a commit, the pull request after both', () => {
    expect(gitKind('git add -A && git commit -m x')).toBe('commit')
    expect(gitKind('git add -A && git commit -m x && git push origin HEAD')).toBe('push')
    expect(gitKind('git push origin HEAD && gh pr create --fill')).toBe('pr')
  })

  it('ignores everything else, including other git commands and words that only look alike', () => {
    for (const c of ['git status', 'git log --grep commit', 'git commit-tree abc', 'git pushd', 'gh pr view 12', 'gh pr merge 12', 'pnpm test', 'ls', '']) expect(gitKind(c), c).toBeNull()
  })
})

describe('what an agent event hands to the git courier', () => {
  const bash = (detail: string, activity: string = 'running') => ({ type: 'activity', activity, tool: 'Bash', detail })

  it('is the kind of the command, the moment the agent runs it (not while it still waits to be allowed)', () => {
    expect(gitKindOfEvent(bash('git commit -am "x"'))).toBe('commit')
    expect(gitKindOfEvent(bash('git push', 'permission'))).toBeNull()
  })

  it('ignores other tools and other events, even when the words look the same', () => {
    expect(gitKindOfEvent({ type: 'activity', activity: 'implementing', tool: 'Edit', detail: 'git commit' })).toBeNull()
    expect(gitKindOfEvent({ type: 'plan' })).toBeNull()
    expect(gitKindOfEvent(bash(''))).toBeNull()
  })
})
