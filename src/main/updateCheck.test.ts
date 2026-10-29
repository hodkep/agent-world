import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildInfo, isHomebrewInstall, isNewer, latestBeta, latestRelease, parseRepo, startChecks, updateMode } from './updateCheck'

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
    expect(buildInfo({ repository: 'github:hodkep/agent-world', awSigned: true })).toEqual({ repo: { owner: 'hodkep', repo: 'agent-world' }, signed: true, mirror: null })
    expect(buildInfo({ repository: 'github:hodkep/agent-world' }).signed).toBe(false)
    expect(buildInfo({ awMirror: 'https://pub-1.r2.dev' }).mirror).toBe('https://pub-1.r2.dev')
    expect(buildInfo({ awMirror: 42 }).mirror).toBeNull()
    expect(buildInfo({ awSigned: 'yes' }).signed).toBe(false)
    expect(buildInfo(null)).toEqual({ repo: null, signed: false, mirror: null })
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
  it('puts a release after its own betas, and a later beta after an earlier one, counting the beta number as a number', () => {
    expect(isNewer('0.7.0-beta.3', 'v0.7.0')).toBe(true)
    expect(isNewer('0.7.0-beta.1', 'v0.7.0-beta.2')).toBe(true)
    expect(isNewer('0.7.0-beta.9', 'v0.7.0-beta.10')).toBe(true)
    expect(isNewer('0.7.0-beta.2', 'v0.7.0-beta.1')).toBe(false)
    expect(isNewer('0.7.0-beta.2', 'v0.7.0-beta.2')).toBe(false)
    expect(isNewer('0.7.0', 'v0.7.0-beta.9')).toBe(false)
    expect(isNewer('0.6.2', 'v0.7.0-beta.1')).toBe(true)
    expect(isNewer('0.7.0-beta.1', 'v0.6.9')).toBe(false)
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
  it('looks once a little after it starts, and again every three hours while it is open', async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => undefined)
    const stop = startChecks(run)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3 * 3600_000 - 21_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(run).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3 * 3600_000)
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
    await vi.advanceTimersByTimeAsync(3 * 3600_000)
    expect(run).toHaveBeenCalledTimes(2)
    // the second look is still waiting when the third time comes round
    await vi.advanceTimersByTimeAsync(3 * 3600_000 - 5_000)
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

describe('the latest stable, whatever version is installed', () => {
  const repo = { owner: 'hodkep', repo: 'agent-world' }
  const latest = (tag: string) => async () => ({ ok: true, status: 200, json: async () => ({ tag_name: tag, body: 'notes' }) })
  const asked = (current: string, tag: string) => latestRelease(current, repo, latest(tag), undefined, { all: true })
  it('is offered with how it stands to what is installed: newer, older, or the same', async () => {
    expect(await asked('0.6.0', 'v0.6.3')).toMatchObject({ state: 'available', latest: '0.6.3', rel: 'newer', detail: '0.6.3 is available.', notes: 'notes' })
    expect(await asked('0.7.0-beta.1', 'v0.6.3')).toMatchObject({ state: 'available', latest: '0.6.3', rel: 'older', detail: '0.6.3 is the latest stable, older than the version you have.' })
    expect(await asked('0.8.0', 'v0.6.3')).toMatchObject({ state: 'available', rel: 'older' })
    expect(await asked('0.7.0', 'v0.7.0')).toMatchObject({ state: 'none', latest: '0.7.0', rel: 'same', detail: 'You have 0.7.0.' })
    // a stable newer than the beta is the ordinary update
    expect(await asked('0.7.0-beta.3', 'v0.7.0')).toMatchObject({ state: 'available', rel: 'newer' })
  })
  it('is only a newer one for the look the app makes by itself (and so the chip): an older stable is never offered unasked', async () => {
    expect(await latestRelease('0.7.0-beta.1', repo, latest('v0.6.3'))).toEqual({ state: 'none' })
    expect(await latestRelease('0.8.0', repo, latest('v0.6.3'))).toEqual({ state: 'none' })
    expect('rel' in (await latestRelease('0.6.0', repo, latest('v0.6.3')))).toBe(false)
  })
  it('is nothing when the tag is not a version', async () => {
    expect(await asked('0.7.0', 'nightly')).toEqual({ state: 'none' })
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

describe('whether this copy was installed with Homebrew', () => {
  const roots = ['/opt/homebrew/Caskroom', '/usr/local/Caskroom']
  it('is so when the cask has a folder in either prefix (Apple Silicon, Intel), and not otherwise', () => {
    expect(isHomebrewInstall(roots, (p) => p === '/opt/homebrew/Caskroom/agent-world')).toBe(true)
    expect(isHomebrewInstall(roots, (p) => p === '/usr/local/Caskroom/agent-world')).toBe(true)
    expect(isHomebrewInstall(roots, () => false)).toBe(false)
    expect(isHomebrewInstall(roots, (p) => p === '/opt/homebrew/Caskroom/other')).toBe(false)
    expect(isHomebrewInstall([], () => true)).toBe(false)
  })
})

describe('the newest beta, whatever version is installed', () => {
  const repo = { owner: 'hodkep', repo: 'agent-world' }
  const rel = (tag: string, o: object = {}) => ({ tag_name: tag, prerelease: true, draft: false, published_at: '2026-10-29T10:00:00Z', body: `notes of ${tag}`, ...o })
  const list = (items: object[]) => async () => ({ ok: true, status: 200, json: async () => items })
  it('asks for the list of releases and takes the newest pre-release tagged -beta.N, with its date, notes and page', async () => {
    const asked: string[] = []
    const get = async (url: string) => (asked.push(url), { ok: true, status: 200, json: async () => [rel('v0.7.0-beta.2'), rel('v0.7.0-beta.10'), rel('v0.7.0-beta.1'), rel('v0.6.2', { prerelease: false })] })
    expect(await latestBeta('0.6.2', repo, get)).toEqual({ state: 'available', rel: 'newer', detail: '0.7.0-beta.10 is available.', latest: '0.7.0-beta.10', notes: 'notes of v0.7.0-beta.10', date: '2026-10-29T10:00:00Z', url: 'https://github.com/hodkep/agent-world/releases/tag/v0.7.0-beta.10' })
    expect(asked).toEqual(['https://api.github.com/repos/hodkep/agent-world/releases?per_page=30'])
  })
  it('skips drafts, releases that are not pre-releases, other pre-release names and tags that are not versions', async () => {
    const r = await latestBeta('0.6.2', repo, list([rel('v0.8.0-beta.1', { draft: true }), rel('v0.8.0-beta.2', { prerelease: false }), rel('v0.8.0-rc.1'), rel('nightly'), rel('v0.7.0-beta.1')]))
    expect(r).toMatchObject({ state: 'available', latest: '0.7.0-beta.1' })
  })
  it('still offers a beta that is older than what is installed, or already a release, as older', async () => {
    expect(await latestBeta('0.7.0', repo, list([rel('v0.7.0-beta.2'), rel('v0.7.0-beta.1')]))).toMatchObject({ state: 'available', latest: '0.7.0-beta.2', rel: 'older', detail: '0.7.0-beta.2 is the newest beta, older than the version you have.' })
    expect(await latestBeta('0.7.0-beta.3', repo, list([rel('v0.7.0-beta.2')]))).toMatchObject({ rel: 'older' })
  })
  it('says you have it when the newest beta is the one installed', async () => {
    expect(await latestBeta('0.7.0-beta.2', repo, list([rel('v0.7.0-beta.2'), rel('v0.7.0-beta.1')]))).toMatchObject({ state: 'none', latest: '0.7.0-beta.2', rel: 'same', detail: 'You have 0.7.0-beta.2.' })
  })
  it('says so when no beta is published', async () => {
    expect(await latestBeta('0.6.2', repo, list([]))).toEqual({ state: 'none', detail: 'No beta has been published.' })
  })
  it('says what went wrong in a line', async () => {
    expect(await latestBeta('0.6.2', repo, async () => ({ ok: false, status: 403, json: async () => ({}) }))).toEqual({ state: 'error', detail: 'GitHub did not answer (403).' })
    expect(await latestBeta('0.6.2', repo, async () => ({ ok: true, status: 200, json: async () => ({ not: 'a list' }) }))).toEqual({ state: 'none', detail: 'No beta has been published.' })
    expect(await latestBeta('0.6.2', repo, async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com') })).toEqual({ state: 'error', detail: 'Could not reach GitHub: getaddrinfo ENOTFOUND api.github.com' })
  })
})
