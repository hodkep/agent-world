import { describe, expect, it } from 'vitest'
import { MASK } from './mcpEdit'
import { describeEntry, describeForScreen, digestOf } from './mcpDescribe'

describe('what starting an entry would run', () => {
  it('says the command, each argument on its own, and every variable with its value, as the probe would start it', () => {
    const d = describeEntry({ command: 'node', args: ['-e', 'a b', 5], env: { NODE_OPTIONS: '--require ./x.js', K: 'v' } }, '/w/p')
    expect(d).toMatchObject({ command: 'node', args: ['-e', 'a b', '5'], cwd: '/w/p' })
    expect(d.env).toEqual([{ name: 'NODE_OPTIONS', value: '--require ./x.js' }, { name: 'K', value: 'v' }])
    expect(d.url).toBeUndefined()
  })
  it('chooses the address or the command by the probe\'s own rule: an address that is text wins, anything else is not one', () => {
    expect(describeEntry({ url: 'https://a.b/mcp', command: 'sh' })).toMatchObject({ url: 'https://a.b/mcp' })
    expect(describeEntry({ url: 'https://a.b/mcp', command: 'sh' }).command).toBeUndefined()
    expect(describeEntry({ url: 5, command: 'sh' })).toMatchObject({ command: 'sh' })
    expect(describeEntry({ url: null, command: 'sh' }).url).toBeUndefined()
  })
  it('says the headers an address would be sent with', () => {
    expect(describeEntry({ url: 'https://a.b', headers: { Authorization: 'Bearer x' } }).headers).toEqual([{ name: 'Authorization', value: 'Bearer x' }])
  })
  it('names the variables that change how a program loads', () => {
    const d = describeEntry({ command: 'npx', env: { PATH: '/tmp/evil', NODE_OPTIONS: '--r x', DYLD_INSERT_LIBRARIES: 'a', ld_preload: 'b', npm_config_prefix: '/x', SAFE: '1' } })
    expect(d.risky.sort()).toEqual(['DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS', 'PATH', 'ld_preload', 'npm_config_prefix'].sort())
    expect(describeEntry({ command: 'npx', env: { SAFE: '1' } }).risky).toEqual([])
  })
})

describe('the digest of an entry', () => {
  it('is the same for the same entry in any key order, and changes with any part of it, or the folder it runs in', () => {
    const a = digestOf({ command: 'a', args: ['x'], env: { A: '1', B: '2' } }, '/w')
    expect(digestOf({ env: { B: '2', A: '1' }, args: ['x'], command: 'a' }, '/w')).toBe(a)
    for (const other of [{ command: 'b', args: ['x'], env: { A: '1', B: '2' } }, { command: 'a', args: ['y'], env: { A: '1', B: '2' } }, { command: 'a', args: ['x'], env: { A: '1', B: '3' } }]) expect(digestOf(other, '/w')).not.toBe(a)
    expect(digestOf({ command: 'a', args: ['x'], env: { A: '1', B: '2' } }, '/other')).not.toBe(a)
  })
  it('is what the description carries', () => {
    const e = { command: 'a' }
    expect(describeEntry(e, '/w').digest).toBe(digestOf(e, '/w'))
  })
})

describe('what the screen is told of an entry', () => {
  const def = { command: 'npx', env: { TOKEN: 'sb_secret_value' }, url: undefined, headers: { H: 'Bearer abc' } }
  it('keeps the values back for an entry in the person\'s own files, with the digest of the real entry', () => {
    const d = describeForScreen({ command: 'npx', env: { TOKEN: 'sb_secret_value' } }, undefined, false)
    expect(d.env).toEqual([{ name: 'TOKEN', value: MASK }])
    expect(JSON.stringify(d)).not.toContain('sb_secret_value')
    expect(d.digest).toBe(digestOf({ command: 'npx', env: { TOKEN: 'sb_secret_value' } }))
  })
  it('keeps back the values of an address too', () => {
    const d = describeForScreen({ url: 'https://a.b/mcp?key=abc123xyz', headers: def.headers }, undefined, false)
    expect(JSON.stringify(d)).not.toMatch(/abc123xyz|Bearer abc/)
  })
  it('shows an entry that comes with a project whole', () => {
    expect(describeForScreen({ command: 'npx', env: { TOKEN: 'v' } }, '/w', true).env).toEqual([{ name: 'TOKEN', value: 'v' }])
  })
})
