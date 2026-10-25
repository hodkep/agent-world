import { describe, expect, it } from 'vitest'
import { describeCommand, ranFor } from './procView'

describe('how long a command has been running', () => {
  it('counts seconds under a minute, then minutes and seconds', () => {
    expect([0, 41, 59].map(ranFor)).toEqual(['0s', '41s', '59s'])
    expect([60, 192, 3599].map(ranFor)).toEqual(['1m 00s', '3m 12s', '59m 59s'])
  })
  it('drops the seconds from an hour on, and the minutes from a day on', () => {
    expect([3600, 3900, 86399].map(ranFor)).toEqual(['1h 00m', '1h 05m', '23h 59m'])
    expect([86400, 90000 + 3600].map(ranFor)).toEqual(['1d 0h', '1d 2h'])
  })
})

describe('what a command line is shown as', () => {
  it('is the program, with its arguments apart', () => {
    expect(describeCommand('sleep 45')).toEqual({ name: 'sleep', rest: '45' })
    expect(describeCommand('/usr/local/bin/node /x/vite --port 5173')).toEqual({ name: 'node', rest: '/x/vite --port 5173' })
    expect(describeCommand('top')).toEqual({ name: 'top', rest: '' })
  })
  it('looks through a shell run with -c, to the command it runs', () => {
    expect(describeCommand('/bin/zsh -c echo done')).toEqual({ name: 'echo', rest: 'done' })
    expect(describeCommand('bash -c')).toEqual({ name: 'bash', rest: '-c' })
  })
  it('calls a shell given a script file a shell script, and shortens its long path', () => {
    const long = '/private/tmp/claude-501/-Users-pratik--agent-world-worktrees-agent-world-e7df06ca-cocain/bb10cb11/tasks/snapshot.sh'
    expect(describeCommand(`/bin/zsh ${long}`)).toEqual({ name: 'zsh script', rest: '/private/tmp/…/snapshot.sh' })
    expect(describeCommand('/bin/zsh ./run.sh')).toEqual({ name: 'zsh script', rest: './run.sh' })
  })
})
