import { describe, expect, it } from 'vitest'
import { isBusy } from './shells'

describe('is a terminal busy', () => {
  it('is not while the shell itself is what is in front, however the system spells its name', () => {
    expect(isBusy('zsh', 'zsh')).toBe(false)
    expect(isBusy('zsh', '-zsh')).toBe(false)
    expect(isBusy('bash', 'bash')).toBe(false)
    expect(isBusy('cmd.exe', 'cmd.exe')).toBe(false)
    expect(isBusy('/bin/zsh', 'zsh')).toBe(false)
  })

  it('is while something else runs in front of it', () => {
    expect(isBusy('zsh', 'node')).toBe(true)
    expect(isBusy('zsh', 'pnpm')).toBe(true)
    expect(isBusy('bash', 'sleep')).toBe(true)
  })

  it('is not when nothing is known yet', () => {
    expect(isBusy('zsh', '')).toBe(false)
    expect(isBusy('zsh', undefined)).toBe(false)
  })
})
