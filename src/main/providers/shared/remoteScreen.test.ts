import { describe, expect, it } from 'vitest'
import { agyRemote } from '../agy/remote'
import { claudeRemote } from '../claude/remote'
import { remoteReader } from './remoteScreen'

describe('remoteReader: a provider\'s own link pattern, and the same reading of a refusal', () => {
  const read = remoteReader(/https:\/\/example\.test\/r\/[\w-]+/)
  it('finds the link, a refusal in the program\'s words, or nothing yet', () => {
    expect(read('Open https://example.test/r/abc-v2 on another device')).toEqual({ link: 'https://example.test/r/abc-v2' })
    expect(read('Remote control is not available for this account.\n> ')).toEqual({ unavailable: 'Remote control is not available for this account.' })
    expect(read('Welcome\n> ')).toBeNull()
  })
  it('prefers the link when both are on the screen', () => {
    expect(read('Remote control disabled earlier\nhttps://example.test/r/zz')).toEqual({ link: 'https://example.test/r/zz' })
  })
})

describe('each provider reads its own link', () => {
  it('claude: claude.ai/code', () => {
    expect(claudeRemote('  /remote-control is active · at https://claude.ai/code/session_01AbC')).toEqual({ link: 'https://claude.ai/code/session_01AbC' })
    expect(claudeRemote('Open https://antigravity.google.com/r/x-v2')).toBeNull()
  })
  it('agy: antigravity.google.com/r, as printed after the trust question', () => {
    const screen = ['> /remote-control', '  ⎿  Remote control on for this session.', '     Hostname: pratiks-macbook', '     Open https://antigravity.google.com/r/4e48024e-c861-499b-95e3-5947395e32b0-v2 on another device to take over.'].join('\n')
    expect(agyRemote(screen)).toEqual({ link: 'https://antigravity.google.com/r/4e48024e-c861-499b-95e3-5947395e32b0-v2' })
    expect(agyRemote('> ')).toBeNull()
  })
})
