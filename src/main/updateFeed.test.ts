import { describe, expect, it } from 'vitest'
import { updateFeed } from './updateFeed'

describe('where an installed app looks for a newer build', () => {
  it('uses the releases of the project on GitHub', () => {
    expect(updateFeed(true)).toEqual({ kind: 'github' })
  })
  it('checks nothing in a build that is not installed', () => {
    expect(updateFeed(false)).toEqual({ kind: 'off', detail: 'Updates only work in the installed app.' })
  })
})
