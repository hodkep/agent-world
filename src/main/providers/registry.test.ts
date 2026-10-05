import { describe, expect, it } from 'vitest'
import { providerById, providerOf, providers } from './registry'

describe('provider registry', () => {
  it('lists Claude Code, and agents saved without a provider are Claude Code', () => {
    expect(providers().map((p) => p.id)).toEqual(['claude'])
    expect(providerOf({}).id).toBe('claude')
    expect(providerById('claude').label).toBe('Claude Code')
  })
})

describe('claude provider surface', () => {
  const claude = providerById('claude')
  it('pastes a message as one prompt and submits it with Enter', () => {
    expect(claude.keys.paste('a\nb')).toBe('\x1b[200~a\nb\x1b[201~')
    expect(claude.keys.submit).toBe('\r')
  })
  it('interrupts with Esc first, then escalates to Ctrl+C', () => {
    expect(claude.keys.interrupt.first).toBe('\x1b')
    expect(claude.keys.interrupt.then.at(-1)).toEqual([3600, '\x03'])
  })
  it('offers its models and modes, and manages tools through its own commands', () => {
    expect(claude.models.map((m) => m.value)).toContain('sonnet')
    expect(claude.modes.map((m) => m.id)).toContain('acceptEdits')
    expect(claude.autonomy).toEqual({ ask: 'default', edit: 'acceptEdits', plan: 'plan', full: 'auto' })
    for (const mode of Object.values(claude.autonomy)) expect(claude.modes.map((m) => m.id)).toContain(mode)
    expect(claude.tools?.list.servers).toEqual(['mcp', 'list'])
    expect(claude.tools?.manage({ kind: 'mcp-remove', name: 'docs' })).toEqual(['mcp', 'remove', 'docs'])
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
