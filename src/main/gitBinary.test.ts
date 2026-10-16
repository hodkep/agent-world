import { describe, expect, it } from 'vitest'
import { bundledEnv, resolveGit, withGitOnPath } from './gitBinary'

const files = (...paths: string[]) => (p: string) => paths.includes(p)
const base = { resourcesPath: '/App/Contents/Resources', platform: 'darwin' as const, arch: 'arm64', path: '/usr/bin:/bin:/usr/sbin:/sbin', xcodeSelectOk: () => false }

describe('which git the app uses', () => {
  it('uses the one the computer has, when it has one that works', () => {
    const g = resolveGit({ ...base, exists: files('/opt/homebrew/bin/git', '/App/Contents/Resources/git/bin/git') })
    expect(g).toMatchObject({ source: 'system', bin: '/opt/homebrew/bin/git', env: {} })
  })
  it('does not count the stub Apple puts at /usr/bin/git until the command line tools are installed, because running it opens their installer', () => {
    const bundled = files('/usr/bin/git', '/App/Contents/Resources/git/bin/git')
    expect(resolveGit({ ...base, exists: bundled, xcodeSelectOk: () => false })).toMatchObject({ source: 'bundled', bin: '/App/Contents/Resources/git/bin/git' })
    expect(resolveGit({ ...base, exists: bundled, xcodeSelectOk: () => true })).toMatchObject({ source: 'system', bin: '/usr/bin/git' })
  })
  it('finds git in the usual places even when the app was started from Finder with a bare path', () => {
    expect(resolveGit({ ...base, exists: files('/usr/local/bin/git') })).toMatchObject({ source: 'system', bin: '/usr/local/bin/git' })
  })
  it('takes the first git on the path on other systems, and the bundled one when there is none', () => {
    expect(resolveGit({ ...base, platform: 'linux', path: '/opt/x:/usr/bin', exists: files('/usr/bin/git') })).toMatchObject({ source: 'system', bin: '/usr/bin/git' })
    expect(resolveGit({ ...base, platform: 'linux', exists: files('/App/Contents/Resources/git/bin/git') })).toMatchObject({ source: 'bundled' })
    expect(resolveGit({ ...base, platform: 'win32', path: 'C:\\Git\\cmd;C:\\Windows', exists: files('C:\\Git\\cmd\\git.exe') })).toMatchObject({ source: 'system', bin: 'C:\\Git\\cmd\\git.exe' })
  })
  it('is nothing when there is neither, so the app can say so', () => {
    expect(resolveGit({ ...base, exists: files() })).toBeNull()
  })
})

describe('choosing the bundled git on purpose, and where it is', () => {
  it('uses the bundled one before the computer\'s own when asked to, which is how a computer with no git is tried on one that has it', () => {
    const exists = files('/opt/homebrew/bin/git', '/App/Contents/Resources/git/bin/git')
    expect(resolveGit({ ...base, exists, prefer: 'bundled' })).toMatchObject({ source: 'bundled' })
    expect(resolveGit({ ...base, exists: files('/opt/homebrew/bin/git'), prefer: 'bundled' })).toMatchObject({ source: 'system' })
  })
  it('is in the folder it is told, as in a build that has not been packaged', () => {
    expect(resolveGit({ ...base, gitDir: '/repo/build/git/darwin-arm64', exists: files('/repo/build/git/darwin-arm64/bin/git') })).toMatchObject({ source: 'bundled', bin: '/repo/build/git/darwin-arm64/bin/git' })
  })
})

describe('what the bundled git needs around it', () => {
  it('is told where its own programs, settings and templates are, as it was built to be run from anywhere', () => {
    const env = bundledEnv('/R/git', 'darwin', '/usr/bin')
    expect(env.GIT_EXEC_PATH).toBe('/R/git/libexec/git-core')
    expect(env.GIT_CONFIG_SYSTEM).toBe('/R/git/etc/gitconfig')
    expect(env.GIT_TEMPLATE_DIR).toBe('/R/git/share/git-core/templates')
    expect(bundledEnv('/R/git', 'linux', '/usr/bin').PREFIX).toBe('/R/git')
  })
  it('leaves a configuration the person set alone', () => {
    expect(bundledEnv('/R/git', 'darwin', '/usr/bin', { GIT_CONFIG_SYSTEM: '/mine' }).GIT_CONFIG_SYSTEM).toBeUndefined()
  })
  it('puts a bundled git first on the path of an agent terminal, so its git and its hooks use it, and leaves the path alone for the computer\'s own', () => {
    const bundled = resolveGit({ ...base, exists: files('/App/Contents/Resources/git/bin/git') })!
    const env = withGitOnPath({ PATH: '/usr/bin:/bin', HOME: '/h' }, bundled, ':')
    expect(env.PATH).toBe('/App/Contents/Resources/git/bin:/usr/bin:/bin')
    expect(env.GIT_EXEC_PATH).toBe('/App/Contents/Resources/git/libexec/git-core')
    expect(env.HOME).toBe('/h')
    const system = resolveGit({ ...base, exists: files('/opt/homebrew/bin/git') })!
    expect(withGitOnPath({ PATH: '/usr/bin' }, system, ':')).toEqual({ PATH: '/usr/bin' })
    expect(withGitOnPath({ PATH: '/usr/bin' }, null, ':')).toEqual({ PATH: '/usr/bin' })
  })
})
