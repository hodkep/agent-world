import { describe, expect, it } from 'vitest'
import { providerById, providerOf, providers } from './registry'

describe('provider registry', () => {
  it('lists Claude Code, and agents saved without a provider are Claude Code', () => {
    expect(providers().map((p) => p.id)).toEqual(['claude'])
    expect(providerOf({}).id).toBe('claude')
    expect(providerById('claude').label).toBe('Claude Code')
  })
})

describe('claude provider detection', () => {
  const claude = providerById('claude')
  it('is ready with the version the program reports', async () => {
    expect(await claude.detect('claude', async () => '2.1.289 (Claude Code)\n')).toEqual({ state: 'ready', version: '2.1.289', path: 'claude' })
  })
  it('is not installed when the program cannot run, with a hint', async () => {
    const d = await claude.detect('claude', async () => Promise.reject(new Error('ENOENT')))
    expect(d.state).toBe('not-installed')
    expect(d.hint).toMatch(/Settings/)
  })
})
