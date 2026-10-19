import { describe, expect, it } from 'vitest'
import { lookAllowed } from './updateInstall'

describe('whether the app may look for an update again', () => {
  it('not while a download runs, waits to be installed, or installs: the look would start it over', () => {
    expect(lookAllowed({ phase: 'downloading', version: '1', received: 1, total: 2 })).toBe(false)
    expect(lookAllowed({ phase: 'ready', version: '1', file: '/x' })).toBe(false)
    expect(lookAllowed({ phase: 'installing', version: '1' })).toBe(false)
  })
  it('otherwise, also after a failed or stopped download', () => {
    expect(lookAllowed(undefined)).toBe(true)
    expect(lookAllowed({ phase: 'idle' })).toBe(true)
    expect(lookAllowed({ phase: 'failed', kind: 'cancelled', reason: 'x' })).toBe(true)
  })
})
