import { describe, expect, it } from 'vitest'
import { longTaskEntry } from './perf'

describe('describing a long task the page reports', () => {
  it('keeps the length, the start and what was on screen', () => {
    const e = longTaskEntry({ name: 'self', startTime: 1234.4, duration: 2310.6 }, { tab: 'Chat', agents: 3 })
    expect(e).toMatchObject({ ms: 2311, start: 1234, tab: 'Chat', agents: 3 })
  })

  it('names the scripts of a long animation frame when the browser gives them', () => {
    const e = longTaskEntry({ name: 'long-animation-frame', startTime: 5, duration: 300, scripts: [{ sourceURL: 'app://x/index.js', sourceFunctionName: 'render', duration: 280 }] }, { tab: '', agents: 0 })
    expect(e.scripts).toEqual([{ file: 'index.js', fn: 'render', ms: 280 }])
  })
})
