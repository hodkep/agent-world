import { describe, expect, it } from 'vitest'
import { helperEnv, releaseOrigins } from './origins'

describe('what the helper that replaces the app is started with', () => {
  const env = { PATH: '/opt/evil/bin:/usr/bin', HOME: '/Users/ada', AW_CODESIGN: '/tmp/true', AW_OPEN: '/tmp/open', AW_DITTO: '/tmp/ditto', AW_MV: '/tmp/mv', AW_PLISTBUDDY: '/tmp/pb', ELECTRON_RUN_AS_NODE: '1', DYLD_INSERT_LIBRARIES: '/tmp/x.dylib', SECRET: 'x' }

  it('is a clean environment in the installed app: a fixed path, the home folder, and no AW_ or ELECTRON_ key', () => {
    expect(helperEnv(true, env)).toEqual({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/Users/ada' })
  })

  it('has nothing in it that could replace a check, whatever the app was started with', () => {
    const keys = Object.keys(helperEnv(true, env))
    expect(keys.filter((k) => /^(AW_|ELECTRON_|DYLD_|LD_)/.test(k))).toEqual([])
  })

  it('lets the test overrides through only when the app is not installed', () => {
    expect(helperEnv(false, env)).toEqual({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: '/Users/ada', AW_CODESIGN: '/tmp/true', AW_OPEN: '/tmp/open', AW_DITTO: '/tmp/ditto', AW_MV: '/tmp/mv', AW_PLISTBUDDY: '/tmp/pb' })
  })

  it('has no home folder entry when there is none', () => {
    expect(helperEnv(true, {})).toEqual({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' })
  })
})

describe('where an update is looked for and downloaded from', () => {
  const real = { api: 'https://api.github.com', downloads: 'https://github.com' }

  it('is GitHub, and GitHub only, in the installed app, whatever the environment says', () => {
    const o = releaseOrigins(true, { AW_UPDATE_RELEASES: 'http://127.0.0.1:9999' })
    expect(o).toMatchObject(real)
    expect(o.allow('http://127.0.0.1:9999/x')).toBe(false)
    expect(o.allow('https://release-assets.githubusercontent.com/a?b=c')).toBe(true)
    expect(o.testing).toBe(false)
  })

  it('is the address in the environment when the app is not installed, and only that address and GitHub-free', () => {
    const o = releaseOrigins(false, { AW_UPDATE_RELEASES: 'http://127.0.0.1:9999' })
    expect(o).toMatchObject({ api: 'http://127.0.0.1:9999/api', downloads: 'http://127.0.0.1:9999', testing: true })
    expect(o.allow('http://127.0.0.1:9999/o/r/releases/download/v0.1.2/a.zip')).toBe(true)
    expect(o.allow('http://127.0.0.1:9998/a.zip')).toBe(false)
    expect(o.allow('https://github.com/a.zip')).toBe(false)
  })

  it('is GitHub when the app is not installed and nothing is set', () => {
    expect(releaseOrigins(false, {})).toMatchObject({ ...real, testing: false })
  })

  it('ignores an address that is not a plain http(s) origin', () => {
    for (const v of ['', 'file:///etc', 'ftp://x', 'nonsense', 'http://127.0.0.1:9999/with/path']) expect(releaseOrigins(false, { AW_UPDATE_RELEASES: v }), v).toMatchObject({ ...real, testing: false })
  })
})

describe('the mirror a test run names', () => {
  const env = { AW_UPDATE_RELEASES: 'http://127.0.0.1:9999', AW_UPDATE_MIRROR: 'http://127.0.0.1:9100', AW_UPDATE_MIRROR_TUNE: '300,100,400' }

  it('is the origin of AW_UPDATE_MIRROR, with the shortened times, in a build that is not installed', () => {
    const m = releaseOrigins(false, env).mirror!
    expect(m.base).toBe('http://127.0.0.1:9100')
    expect(m.allow('http://127.0.0.1:9100/v0.1.2/x.zip')).toBe(true)
    expect(m.allow('http://127.0.0.1:9999/x.zip')).toBe(false)
    expect(m.tune).toMatchObject({ headersMs: 300, graceMs: 100, windowMs: 400 })
  })

  it('is ignored by the installed app, and when it is not an origin', () => {
    expect(releaseOrigins(true, env).mirror).toBeUndefined()
    expect(releaseOrigins(false, { ...env, AW_UPDATE_MIRROR: 'http://127.0.0.1:9100/path' }).mirror).toBeUndefined()
    expect(releaseOrigins(false, {}).mirror).toBeUndefined()
  })
})
