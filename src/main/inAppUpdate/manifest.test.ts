import { describe, expect, it } from 'vitest'
import { MAX_BYTES, allowedHost, assetFor, parseLatestMac } from './manifest'

// What the release of 0.1.1 really publishes as latest-mac.yml.
const YML = `version: 0.1.1
files:
  - url: Agent-World-0.1.1-x64.zip
    sha512: ssfPGakih0CiJinspXPWHicu7//TfTwfpo7GAPR12x8yy6rgSL42sTo8l04Iu5PMqxtM5JYUFGrY59cME3fFqA==
    size: 298499189
  - url: Agent-World-0.1.1-arm64.zip
    sha512: Qx/WZb4L+iloQfEaEQuCsnAnwvvOjRLHHg1nhULY9unXmInjQmE9ay3jQaNG4eWfHq81ctnFNF1cTOilbZA37A==
    size: 287554113
  - url: Agent-World-0.1.1-x64.dmg
    sha512: cgZu4t45al9iLM2rpOlU5V0COtwdEhoLNNErZZoBg9h/sc2iM2Q9TiXEsOQ31uIAZ6F3wsnuwW8ZhdU5LExAfA==
    size: 298415600
path: Agent-World-0.1.1-x64.zip
sha512: ssfPGakih0CiJinspXPWHicu7//TfTwfpo7GAPR12x8yy6rgSL42sTo8l04Iu5PMqxtM5JYUFGrY59cME3fFqA==
releaseDate: '2026-10-17T20:37:59.331Z'
`
const repo = { owner: 'hodkep', repo: 'agent-world' }

describe('reading latest-mac.yml', () => {
  it('lists the files with their name, checksum and size, and the version', () => {
    const m = parseLatestMac(YML)!
    expect(m.version).toBe('0.1.1')
    expect(m.files.map((f) => f.url)).toEqual(['Agent-World-0.1.1-x64.zip', 'Agent-World-0.1.1-arm64.zip', 'Agent-World-0.1.1-x64.dmg'])
    expect(m.files[1]).toEqual({ url: 'Agent-World-0.1.1-arm64.zip', sha512: 'Qx/WZb4L+iloQfEaEQuCsnAnwvvOjRLHHg1nhULY9unXmInjQmE9ay3jQaNG4eWfHq81ctnFNF1cTOilbZA37A==', size: 287554113 })
  })
  it('is nothing for text that is not one', () => {
    expect(parseLatestMac('')).toBeNull()
    expect(parseLatestMac('<html>not found</html>')).toBeNull()
    expect(parseLatestMac('version: 0.1.1\nfiles:\n')).toBeNull()
  })
})

describe('the file to download for this computer', () => {
  it('is the zip of its processor, at an address built from the repository and the tag, never from the manifest', () => {
    const a = assetFor({ manifest: parseLatestMac(YML)!, arch: 'arm64', current: '0.1.0', repo, tag: 'v0.1.1' })
    expect(a).toEqual({
      ok: true,
      asset: {
        version: '0.1.1',
        name: 'Agent-World-0.1.1-arm64.zip',
        url: 'https://github.com/hodkep/agent-world/releases/download/v0.1.1/Agent-World-0.1.1-arm64.zip',
        sha512: 'Qx/WZb4L+iloQfEaEQuCsnAnwvvOjRLHHg1nhULY9unXmInjQmE9ay3jQaNG4eWfHq81ctnFNF1cTOilbZA37A==',
        size: 287554113
      }
    })
    expect(assetFor({ manifest: parseLatestMac(YML)!, arch: 'x64', current: '0.1.0', repo, tag: 'v0.1.1' })).toMatchObject({ ok: true, asset: { name: 'Agent-World-0.1.1-x64.zip' } })
  })

  it('refuses a version that is not newer than the running one', () => {
    for (const current of ['0.1.1', '0.2.0']) expect(assetFor({ manifest: parseLatestMac(YML)!, arch: 'arm64', current, repo, tag: 'v0.1.1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/not newer/i) })
  })

  it('refuses a manifest that says another version than the tag it came from', () => {
    expect(assetFor({ manifest: parseLatestMac(YML)!, arch: 'arm64', current: '0.1.0', repo, tag: 'v0.1.2' })).toMatchObject({ ok: false, reason: expect.stringMatching(/tag/i) })
  })

  it('refuses a file name with a path, another version, or a processor that is not this one, and a file that is not a zip', () => {
    const base = parseLatestMac(YML)!
    const with1 = (url: string) => ({ ...base, files: [{ url, sha512: 'x', size: 10 }] })
    for (const url of ['../Agent-World-0.1.1-arm64.zip', 'https://evil.example/Agent-World-0.1.1-arm64.zip', 'sub/Agent-World-0.1.1-arm64.zip', 'Agent-World-0.1.0-arm64.zip', 'Agent-World-0.1.1-x64.zip', 'Agent-World-0.1.1-arm64.dmg', 'Agent-World-0.1.1-arm64.zip.blockmap'])
      expect(assetFor({ manifest: with1(url), arch: 'arm64', current: '0.1.0', repo, tag: 'v0.1.1' }), url).toMatchObject({ ok: false })
  })

  it('refuses a size that is nothing or over the cap', () => {
    const base = parseLatestMac(YML)!
    for (const size of [0, -5, MAX_BYTES + 1]) expect(assetFor({ manifest: { ...base, files: [{ url: 'Agent-World-0.1.1-arm64.zip', sha512: 'x', size }] }, arch: 'arm64', current: '0.1.0', repo, tag: 'v0.1.1' })).toMatchObject({ ok: false, reason: expect.stringMatching(/size/i) })
    expect(MAX_BYTES).toBe(600 * 1024 * 1024)
  })

  it('refuses a processor it has no file for', () => {
    expect(assetFor({ manifest: parseLatestMac(YML)!, arch: 'ia32', current: '0.1.0', repo, tag: 'v0.1.1' })).toMatchObject({ ok: false })
  })
})

describe('which hosts a download may come from', () => {
  it('are GitHub and the hosts its release downloads go on to, over https only', () => {
    expect(allowedHost('https://github.com/hodkep/agent-world/releases/download/v0.1.1/a.zip')).toBe(true)
    expect(allowedHost('https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sp=r')).toBe(true)
    expect(allowedHost('https://objects.githubusercontent.com/github-production-release-asset-2e65be/1/2')).toBe(true)
  })
  it('are not anyone else, not another scheme, and not a look-alike', () => {
    for (const u of ['http://github.com/x', 'https://evil.example/x', 'https://github.com.evil.example/x', 'https://notgithub.com/x', 'https://githubusercontent.com/x', 'https://evil.example/release-assets.githubusercontent.com', 'ftp://github.com/x', 'file:///etc/passwd', 'not a url', 'https://user@github.com@evil.example/x']) expect(allowedHost(u), u).toBe(false)
  })
})
