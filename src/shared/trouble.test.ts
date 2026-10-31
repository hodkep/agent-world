import { describe, expect, it } from 'vitest'
import { troubleOf } from './trouble'

describe('which failed commands are worth recording, and what they are called', () => {
  it('a git commit that has no identity', () => {
    expect(troubleOf('git commit -m "feat: x"', 'Author identity unknown\n\n*** Please tell me who you are.')).toMatchObject({ label: 'identity', command: 'git commit -m "feat: x"' })
  })
  it('a git commit with no name or email given', () => {
    expect(troubleOf('git commit --allow-empty -m probe', 'fatal: no email was given and auto-detection is disabled')?.label).toBe('identity')
  })
  it('a git push that cannot reach the remote', () => {
    expect(troubleOf('git push origin aw/os', "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com")?.label).toBe('network')
  })
  it('a git push that is refused for who the person is', () => {
    expect(troubleOf('git push origin main', 'remote: Permission to x/y.git denied to bob.\nfatal: unable to access')?.label).toBe('permission')
    expect(troubleOf('git push', 'fatal: could not read Username for https://github.com')?.label).toBe('permission')
  })
  it('a git command a hook turned down, and any other git failure', () => {
    expect(troubleOf('git commit -m x', 'Agent World: Commit on your own branch, aw/ada, not on main')?.label).toBe('hook')
    expect(troubleOf('git status', 'fatal: not a git repository')?.label).toBe('other')
  })
  it('a failed test, build or lint command is named by what it is', () => {
    expect(troubleOf('pnpm test', 'FAIL src/a.test.ts\n3 failed')?.label).toBe('tests')
    expect(troubleOf('npx vitest run', 'FAIL')?.label).toBe('tests')
    expect(troubleOf('npx electron-vite build', 'error')?.label).toBe('build')
    expect(troubleOf('npx tsc --noEmit', 'error TS2322')?.label).toBe('build')
    expect(troubleOf('npx eslint .', '3 problems')?.label).toBe('lint')
  })
  it('a git command inside a chain still counts', () => {
    expect(troubleOf('cd repo && git push origin x', 'Could not resolve host: github.com')?.label).toBe('network')
  })
  it('other commands that failed are not recorded', () => {
    expect(troubleOf('ls /nope', 'No such file or directory')).toBeNull()
    expect(troubleOf('curl https://x', 'failed')).toBeNull()
  })
  it('keeps the command and the end of the error short', () => {
    const t = troubleOf(`git commit -m "${'x'.repeat(400)}"`, 'e\n'.repeat(1000))!
    expect(t.command.length).toBeLessThanOrEqual(200)
    expect(t.error.length).toBeLessThanOrEqual(600)
  })
})
