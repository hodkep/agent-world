import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildInfo, isNewer, latestRelease, parseRepo, startChecks, updateMode } from './updateCheck'

describe('the repository an installed app takes its releases from', () => {
  it('reads it from the repository field of package.json in the forms npm allows', () => {
    expect(parseRepo('github:hodkep/agent-world')).toEqual({ owner: 'hodkep', repo: 'agent-world' })
    expect(parseRepo('https://github.com/hodkep/agent-world.git')).toEqual({ owner: 'hodkep', repo: 'agent-world' })
    expect(parseRepo({ type: 'git', url: 'git+https://github.com/hodkep/agent-world.git' })).toEqual({ owner: 'hodkep', repo: 'agent-world' })
    expect(parseRepo('hodkep/agent-world')).toEqual({ owner: 'hodkep', repo: 'agent-world' })
  })
  it('is nothing for anything that is not a GitHub repository', () => {
    expect(parseRepo(undefined)).toBeNull()
    expect(parseRepo('https://example.com/x/y')).toBeNull()
    expect(parseRepo('nonsense')).toBeNull()
  })
})

describe('what the build says about itself', () => {
  it('is signed only when the release workflow said so, and takes its repository from package.json', () => {
    expect(buildInfo({ repository: 'github:hodkep/agent-world', awSigned: true })).toEqual({ repo: { owner: 'hodkep', repo: 'agent-world' }, signed: true })
    expect(buildInfo({ repository: 'github:hodkep/agent-world' }).signed).toBe(false)
    expect(buildInfo({ awSigned: 'yes' }).signed).toBe(false)
    expect(buildInfo(null)).toEqual({ repo: null, signed: false })
  })
})

describe('which version is newer', () => {
  it('compares major, minor and patch as numbers, with or without a v', () => {
    expect(isNewer('0.1.0', 'v0.2.0')).toBe(true)
    expect(isNewer('0.9.0', 'v0.10.0')).toBe(true)
    expect(isNewer('0.2.0', 'v0.2.0')).toBe(false)
    expect(isNewer('1.0.0', '0.9.9')).toBe(false)
  })
  it('does not call a pre-release of the version you have newer, and is no one for a tag that is not a version', () => {
    expect(isNewer('0.2.0', 'v0.2.0-beta.1')).toBe(false)
    expect(isNewer('0.1.0', 'nightly')).toBe(false)
  })
})

describe('whether an installed app can install an update itself', () => {
  it('can on Windows and Linux, and on a Mac only when the build was signed with a Developer ID, because macOS refuses to replace an app that is not', () => {
    expect(updateMode({ packaged: true, platform: 'win32', signed: false })).toBe('install')
    expect(updateMode({ packaged: true, platform: 'linux', signed: false })).toBe('install')
    expect(updateMode({ packaged: true, platform: 'darwin', signed: true })).toBe('install')
    expect(updateMode({ packaged: true, platform: 'darwin', signed: false })).toBe('tell')
  })
  it('does nothing for a build that is not installed', () => {
    expect(updateMode({ packaged: false, platform: 'darwin', signed: false })).toBe('off')
  })
})

describe('when the app looks for a new version by itself', () => {
  afterEach(() => vi.useRealTimers())
  it('looks once a little after it starts, and again every six hours while it is open', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => undefined)
    const stop = startChecks(run)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(6 * 3600_000 - 21_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(6 * 3600_000)
    expect(run).toHaveBeenCalledTimes(3)
    stop()
    await vi.advanceTimersByTimeAsync(24 * 3600_000)
    expect(run).toHaveBeenCalledTimes(3)
  })
  it('keeps going after a look that failed, and does not start a look while the last one is still running', async () => {
    vi.useFakeTimers()
    let calls = 0
    const run = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('offline')
      await new Promise((r) => setTimeout(r, 7 * 3600_000))
    })
    startChecks(run)
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(6 * 3600_000)
    expect(run).toHaveBeenCalledTimes(2)
    // the second look is still waiting when the third time comes round
    await vi.advanceTimersByTimeAsync(6 * 3600_000 - 5_000)
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('asking GitHub for the latest release', () => {
  const repo = { owner: 'hodkep', repo: 'agent-world' }
  const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body })
  it('says which version is out and where its page is, when it is newer', async () => {
    let asked = ''
    const f = async (url: string) => ((asked = url), ok({ tag_name: 'v0.2.0', html_url: 'https://github.com/hodkep/agent-world/releases/tag/v0.2.0' })())
    expect(await latestRelease('0.1.0', repo, f)).toEqual({ state: 'available', detail: '0.2.0 is available.', latest: '0.2.0', url: 'https://github.com/hodkep/agent-world/releases/tag/v0.2.0' })
    expect(asked).toBe('https://api.github.com/repos/hodkep/agent-world/releases/latest')
  })
  it('says there is nothing newer when the release is the one you have', async () => {
    expect(await latestRelease('0.2.0', repo, ok({ tag_name: 'v0.2.0', html_url: 'https://x' }))).toEqual({ state: 'none' })
  })
  it('says what went wrong, in a line, when GitHub cannot be asked or has no release yet', async () => {
    expect(await latestRelease('0.1.0', repo, async () => ({ ok: false, status: 404, json: async () => ({}) }))).toEqual({ state: 'none', detail: 'No release is published yet.' })
    expect(await latestRelease('0.1.0', repo, async () => ({ ok: false, status: 403, json: async () => ({}) }))).toEqual({ state: 'error', detail: 'GitHub did not answer (403).' })
    expect(await latestRelease('0.1.0', repo, async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com') })).toEqual({ state: 'error', detail: 'Could not reach GitHub: getaddrinfo ENOTFOUND api.github.com' })
  })
  it("carries the release's own text (its body) as the notes, from the same answer, cut when it is huge; no text, no notes", async () => {
    const repo2 = { owner: 'hodkep', repo: 'agent-world' }
    const withBody = (body: unknown) => ok({ tag_name: 'v0.2.0', body })
    expect(await latestRelease('0.1.0', repo2, withBody('## What changed\n\n- A thing'))).toMatchObject({ state: 'available', notes: '## What changed\n\n- A thing' })
    const huge = await latestRelease('0.1.0', repo2, withBody('x'.repeat(50_000)))
    expect(huge.notes!.length).toBeLessThanOrEqual(20_001)
    expect(huge.notes!.endsWith('…')).toBe(true)
    for (const empty of [undefined, null, '', '   \n', 5, { text: 'x' }]) expect('notes' in (await latestRelease('0.1.0', repo2, withBody(empty)))).toBe(false)
  })
  it('opens only a release page on GitHub, never an address the answer made up', async () => {
    const r = await latestRelease('0.1.0', repo, ok({ tag_name: 'v0.2.0', html_url: 'https://evil.example/x' }))
    expect(r.url).toBe('https://github.com/hodkep/agent-world/releases/tag/v0.2.0')
  })
})

describe('where the release is asked for', () => {
  const repo = { owner: 'hodkep', repo: 'agent-world' }
  it('is GitHub unless a test run gave a server of its own, and the page and the question are built from that origin and the repository', async () => {
    const asked: string[] = []
    const get = async (url: string) => (asked.push(url), { ok: true, status: 200, json: async () => ({ tag_name: 'v0.2.0' }) })
    expect(await latestRelease('0.1.0', repo, get)).toMatchObject({ state: 'available', url: 'https://github.com/hodkep/agent-world/releases/tag/v0.2.0' })
    expect(asked).toEqual(['https://api.github.com/repos/hodkep/agent-world/releases/latest'])
    asked.length = 0
    expect(await latestRelease('0.1.0', repo, get, { api: 'http://127.0.0.1:9999/api', downloads: 'http://127.0.0.1:9999' })).toMatchObject({ state: 'available', url: 'http://127.0.0.1:9999/hodkep/agent-world/releases/tag/v0.2.0' })
    expect(asked).toEqual(['http://127.0.0.1:9999/api/repos/hodkep/agent-world/releases/latest'])
  })
})
