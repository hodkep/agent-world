import { describe, expect, it } from 'vitest'
import { installCommand, installLaunch } from './installRun'
import { parseGitVersion } from './gitBinary'

describe('the command that installs an agent tool', () => {
  it('is the one the program says, run by the person\'s own login shell so the installer sees their usual environment, and ending when the installer ends', () => {
    expect(installLaunch('curl -fsSL https://claude.ai/install.sh | bash', 'darwin', '/bin/zsh')).toEqual({ file: '/bin/zsh', args: ['-lc', 'curl -fsSL https://claude.ai/install.sh | bash'] })
    expect(installLaunch('echo hi', 'linux', undefined)).toEqual({ file: '/bin/sh', args: ['-lc', 'echo hi'] })
  })
  it('is not run on Windows, where the command to copy is the way', () => {
    expect(installLaunch('curl x | bash', 'win32', undefined)).toBeNull()
  })
  it('comes from the program that was not found, never from the screen, and only while it is not found', () => {
    expect(installCommand({ state: 'not-installed', install: 'curl a | bash' }, {})).toBe('curl a | bash')
    expect(installCommand({ state: 'ready', install: 'curl a | bash' }, {})).toBeNull()
    expect(installCommand({ state: 'not-installed' }, {})).toBeNull()
  })
  it('can be replaced for a test, as the program\'s own path can', () => {
    expect(installCommand({ state: 'not-installed', install: 'curl a | bash' }, { AW_INSTALL_COMMAND: 'exit 3' })).toBe('exit 3')
  })
})

describe('the version git reports', () => {
  it('is the number, whatever the vendor adds after it', () => {
    expect(parseGitVersion('git version 2.53.0\n')).toBe('2.53.0')
    expect(parseGitVersion('git version 2.39.5 (Apple Git-154)')).toBe('2.39.5')
    expect(parseGitVersion('git version 2.43.0.windows.1')).toBe('2.43.0')
    expect(parseGitVersion('error')).toBeUndefined()
  })
})
