import { describe, expect, it } from 'vitest'
import { updateFeed } from './updateFeed'

describe('where an installed app looks for a newer build', () => {
  it('uses the releases of the project on GitHub when no address is set', () => {
    expect(updateFeed('', true)).toEqual({ kind: 'github' })
    expect(updateFeed('   ', true)).toEqual({ kind: 'github' })
  })
  it('uses the address from Settings when there is one, as a folder that serves the files the build produces', () => {
    expect(updateFeed('https://example.com/agent-world/', true)).toEqual({ kind: 'generic', url: 'https://example.com/agent-world/' })
    expect(updateFeed(' http://builds.local/aw ', true)).toEqual({ kind: 'generic', url: 'http://builds.local/aw' })
  })
  it('says what is wrong with an address that is not a web address, and does not fall back to GitHub behind it', () => {
    expect(updateFeed('ftp://example.com/x', true)).toEqual({ kind: 'off', detail: 'The update address must start with http:// or https://.' })
    expect(updateFeed('example.com', true)).toMatchObject({ kind: 'off' })
  })
  it('checks nothing in a build that is not installed, whatever the address', () => {
    expect(updateFeed('', false)).toEqual({ kind: 'off', detail: 'Updates only work in the installed app.' })
    expect(updateFeed('https://example.com/', false)).toMatchObject({ kind: 'off' })
  })
})
