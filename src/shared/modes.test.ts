import { describe, expect, it } from 'vitest'
import { modeInfo, modeLabel } from './modes'

describe('how much an agent may do alone, under either program\'s names', () => {
  it('shows agy\'s modes with the same names and colours as the matching Claude ones', () => {
    expect(modeInfo('accept-edits')).toBe(modeInfo('acceptEdits'))
    expect(modeInfo('request-review')).toBe(modeInfo('default'))
    expect(modeInfo('skip-permissions')).toBe(modeInfo('bypassPermissions'))
    expect(modeLabel('plan')).toBe('Plan')
  })
  it('treats no mode as asking first', () => {
    expect(modeInfo(undefined).id).toBe('default')
  })
})
