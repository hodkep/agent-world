import { describe, expect, it } from 'vitest'
import { configJsonPaths, detectClaude, onboardingOf, parseStatus, signInState } from './signin'

const signedIn = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', configDirectory: '/Users/a/.claude' })
const out = JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty', configDirectory: '/Users/a/.claude' })

describe('what `claude auth status` says', () => {
  it('is who is signed in, how, with which provider, and where the configuration is', () => {
    expect(parseStatus(signedIn)).toEqual({ loggedIn: true, apiProvider: 'firstParty', configDirectory: '/Users/a/.claude' })
    expect(parseStatus(out)).toMatchObject({ loggedIn: false })
  })
  it('is nothing when it printed nothing readable, as an older Claude Code that has no such command does', () => {
    expect(parseStatus('')).toBeNull()
    expect(parseStatus('error: unknown command')).toBeNull()
    expect(parseStatus('[1,2]')).toBeNull()
  })
})

describe('where Claude Code keeps what it knows about its first run', () => {
  it('is .claude.json in its config folder, and for the default folder in the home folder', () => {
    expect(configJsonPaths('/work/cfg', '/Users/a')).toEqual(['/work/cfg/.claude.json'])
    expect(configJsonPaths('/Users/a/.claude', '/Users/a')).toEqual(['/Users/a/.claude/.claude.json', '/Users/a/.claude.json'])
  })
  it('says the questions were answered only when Claude Code wrote that down, and that it does not know when it cannot tell', () => {
    expect(onboardingOf('{"hasCompletedOnboarding": true}')).toBe('done')
    expect(onboardingOf('{"oauthAccount": {}}')).toBe('not-done')
    expect(onboardingOf('{"hasCompletedOnboarding": false}')).toBe('not-done')
    expect(onboardingOf(null)).toBe('unknown')
    expect(onboardingOf('not json')).toBe('unknown')
  })
})

describe('whether Claude Code is ready to be used by an agent', () => {
  it('is ready when someone is signed in and the first questions were answered', () => {
    expect(signInState({ loggedIn: true, apiProvider: 'firstParty' }, 'done')).toEqual({ state: 'ready' })
  })
  it('needs sign-in when nobody is, and says to open a terminal and what it will ask', () => {
    const s = signInState({ loggedIn: false, apiProvider: 'firstParty' }, 'unknown')
    expect(s.state).toBe('needs-sign-in')
    expect((s as { hint: string }).hint).toMatch(/not signed in/)
    expect((s as { hint: string }).hint).toMatch(/terminal/)
  })
  it('needs sign-in when someone is signed in but the first questions were never answered, which would otherwise be asked in the middle of a chat', () => {
    const s = signInState({ loggedIn: true, apiProvider: 'firstParty' }, 'not-done')
    expect(s.state).toBe('needs-sign-in')
    expect((s as { hint: string }).hint).toMatch(/first-run questions/)
  })
  it('does not hold anyone back for what it cannot tell: no status, an unknown first run, or a provider of its own (Bedrock, Vertex)', () => {
    expect(signInState(null, 'not-done')).toEqual({ state: 'ready' })
    expect(signInState({ loggedIn: true, apiProvider: 'firstParty' }, 'unknown')).toEqual({ state: 'ready' })
    expect(signInState({ loggedIn: false, apiProvider: 'bedrock' }, 'unknown')).toEqual({ state: 'ready' })
  })
})

describe('finding Claude Code and what it needs', () => {
  const base = { run: async () => '2.1.302 (Claude Code)', home: '/Users/a' }
  it('is not installed when it does not run, with how to install it', async () => {
    const d = await detectClaude('claude', { ...base, run: async () => { throw new Error('ENOENT') }, status: async () => '', readJson: () => null })
    expect(d).toMatchObject({ state: 'not-installed' })
    expect(d.install).toContain('claude.ai/install')
  })
  it('is ready, with its version and where it is, when it is signed in and set up', async () => {
    const d = await detectClaude('/Users/a/.local/bin/claude', { ...base, status: async () => signedIn, readJson: (p) => (p === '/Users/a/.claude/.claude.json' || p === '/Users/a/.claude.json' ? '{"hasCompletedOnboarding":true}' : null) })
    expect(d).toEqual({ state: 'ready', version: '2.1.302', path: '/Users/a/.local/bin/claude' })
  })
  it('needs sign-in when nobody is signed in', async () => {
    expect(await detectClaude('claude', { ...base, status: async () => out, readJson: () => null })).toMatchObject({ state: 'needs-sign-in', version: '2.1.302' })
  })
  it('needs sign-in when the first questions are not answered, and only reads the file, never writes it', async () => {
    const read: string[] = []
    const d = await detectClaude('claude', { ...base, status: async () => signedIn, readJson: (p) => (read.push(p), p === '/Users/a/.claude.json' ? '{"oauthAccount":{}}' : null) })
    expect(d).toMatchObject({ state: 'needs-sign-in' })
    expect(read).toContain('/Users/a/.claude.json')
  })
  it('is ready when the home folder\'s .claude.json says the questions were answered, even though .claude/.claude.json (a small file Claude Code also keeps) says nothing about it', async () => {
    // As on a real Mac: the folder's own file holds a few migration markers and no hasCompletedOnboarding; the one in the home folder holds the flag.
    const d = await detectClaude('claude', { ...base, status: async () => signedIn, readJson: (p) => (p === '/Users/a/.claude/.claude.json' ? '{"firstStartTime":"2025-09-25T05:32:00Z","migrationVersion":12}' : p === '/Users/a/.claude.json' ? '{"hasCompletedOnboarding":true,"oauthAccount":{}}' : null) })
    expect(d).toMatchObject({ state: 'ready' })
  })
  it('still needs sign-in when no file says so and one of them shows a first run that never finished', async () => {
    const d = await detectClaude('claude', { ...base, status: async () => signedIn, readJson: (p) => (p === '/Users/a/.claude/.claude.json' ? '{"migrationVersion":12}' : p === '/Users/a/.claude.json' ? '{"oauthAccount":{}}' : null) })
    expect(d).toMatchObject({ state: 'needs-sign-in' })
  })
  it('is ready when there is no file to read at all, as in a fresh test setup', async () => {
    expect(await detectClaude('claude', { ...base, status: async () => signedIn, readJson: () => null })).toMatchObject({ state: 'ready' })
  })
})
