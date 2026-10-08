import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shellIntegration } from './shellIntegration'

const dir = () => mkdtempSync(join(tmpdir(), 'aw-si-'))

describe('shellIntegration', () => {
  it('starts zsh from a folder of ours that loads the user\'s own files and then marks each prompt', () => {
    const d = dir()
    const r = shellIntegration('/bin/zsh', d, '/Users/me/.zdot')
    expect(r.args).toEqual(['-l'])
    expect(r.env).toEqual({ ZDOTDIR: join(d, 'zsh'), AW_USER_ZDOTDIR: '/Users/me/.zdot' })
    expect(readFileSync(join(d, 'zsh', '.zshrc'), 'utf8')).toContain('133;A')
    expect(readFileSync(join(d, 'zsh', '.zshrc'), 'utf8')).toContain('.zshrc')
  })

  it('starts bash from an init file that reads the login files and then marks each prompt', () => {
    const d = dir()
    const r = shellIntegration('/usr/local/bin/bash', d)
    expect(r.args).toEqual(['--init-file', join(d, 'bash.sh')])
    expect(r.env).toEqual({})
    const text = readFileSync(join(d, 'bash.sh'), 'utf8')
    expect(text).toContain('.bash_profile')
    expect(text).toContain('133;D')
  })

  it('leaves any other shell as it was', () => {
    expect(shellIntegration('/usr/bin/fish', dir())).toEqual({ args: ['-l'], env: {} })
  })
})
