import { describe, expect, it } from 'vitest'
import { resolveCommand } from './command'

const on = (...files: string[]) => (p: string) => files.includes(p)

describe('resolveCommand', () => {
  it('uses the name as given outside Windows', () => {
    expect(resolveCommand('claude', { platform: 'linux' })).toEqual({ file: 'claude', prefix: [] })
  })
  it('finds an .exe on the PATH on Windows', () => {
    expect(resolveCommand('claude', { platform: 'win32', path: 'C:\\a;C:\\b', pathExt: '.EXE;.CMD', exists: on('C:\\b\\claude.EXE') }).file).toBe('C:\\b\\claude.EXE')
  })
  it('runs an npm .cmd wrapper through cmd.exe', () => {
    expect(resolveCommand('claude', { platform: 'win32', path: 'C:\\npm', pathExt: '.EXE;.CMD', exists: on('C:\\npm\\claude.CMD') })).toEqual({ file: 'cmd.exe', prefix: ['/c', 'C:\\npm\\claude.CMD'] })
  })
  it('takes a full path from Settings as it is', () => {
    expect(resolveCommand('C:\\tools\\claude.exe', { platform: 'win32', path: '', exists: on('C:\\tools\\claude.exe') }).file).toBe('C:\\tools\\claude.exe')
  })
  it('gives up quietly when nothing is found', () => {
    expect(resolveCommand('claude', { platform: 'win32', path: 'C:\\a', exists: () => false })).toEqual({ file: 'claude', prefix: [] })
  })
})
