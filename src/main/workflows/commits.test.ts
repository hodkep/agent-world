import { describe, expect, it } from 'vitest'
import { LOG_FORMAT, parseCommitLog } from './commits'

describe('reading git log into commits', () => {
  it('turns each line of the log format into a sha, a time in ms and a subject, oldest first as git printed them', () => {
    const out = `aaa111\t1700000000\tfix: keep query\nbbb222\t1700000100\tfeat: add toggle | with a bar\n`
    expect(parseCommitLog(out)).toEqual([
      { sha: 'aaa111', at: 1_700_000_000_000, subject: 'fix: keep query' },
      { sha: 'bbb222', at: 1_700_000_100_000, subject: 'feat: add toggle | with a bar' }
    ])
  })
  it('skips blank and damaged lines', () => {
    expect(parseCommitLog('\nnot a log line\nccc333\tNaN\tx\nddd444\t5\tok')).toEqual([{ sha: 'ddd444', at: 5000, subject: 'ok' }])
  })
  it('asks git for exactly the fields it parses', () => {
    expect(LOG_FORMAT).toBe('%H%x09%ct%x09%s')
  })
})
