import { describe, expect, it } from 'vitest'
import { editFile, enableEntry, findRaw, maskEntry, MASK, prepareEntry, unmaskEntry } from './mcpEdit'

describe('the entry as the screen shows it', () => {
  it('shows the names of variables and headers, and the parts of an address that hold a key, with the values masked', () => {
    const m = maskEntry({ type: 'http', url: 'https://u:pw@mcp.example.com/p?key=abc&x=1', headers: { Authorization: 'Bearer s' }, env: { TOKEN: 'sb_secret' }, command: 'npx' })
    expect(m).toEqual({ type: 'http', url: `https://u:${MASK}@mcp.example.com/p?key=${MASK}&x=${MASK}`, headers: { Authorization: MASK }, env: { TOKEN: MASK }, command: 'npx' })
    expect(JSON.stringify(m)).not.toMatch(/sb_secret|Bearer s|abc|pw@/)
  })
  it('leaves an address with no key as it is', () => {
    expect(maskEntry({ url: 'http://localhost:4401/mcp' })).toEqual({ url: 'http://localhost:4401/mcp' })
  })
})

describe('what is typed back', () => {
  const old = { command: 'npx', env: { TOKEN: 'real', A: 'a' }, url: undefined }
  it('keeps a value that is still masked and takes one that was typed over', () => {
    expect(unmaskEntry({ command: 'npx', env: { TOKEN: MASK, A: 'new' } }, old).env).toEqual({ TOKEN: 'real', A: 'new' })
    expect(unmaskEntry({ url: `https://mcp.x/p?key=${MASK}&n=2`, headers: { H: MASK } }, { url: 'https://mcp.x/p?key=abc&n=1', headers: { H: 'v' } })).toEqual({ url: 'https://mcp.x/p?key=abc&n=2', headers: { H: 'v' } })
  })
  it('refuses a masked value that has nothing to keep, saying which', () => {
    expect(() => unmaskEntry({ env: { NEW: MASK } }, old)).toThrow(/NEW/)
    expect(() => unmaskEntry({ env: { TOKEN: MASK } }, undefined)).toThrow(/TOKEN/)
  })
})

describe('checking an entry before anything is written', () => {
  const ok = (j: unknown) => prepareEntry(JSON.stringify(j))
  it('takes a command or an address with the fields it reads, and nothing else is changed in it', () => {
    expect(ok({ type: 'stdio', command: 'npx', args: ['-y', 'x'], env: { A: 'b' }, extra: { keep: 1 } })).toMatchObject({ command: 'npx', extra: { keep: 1 } })
    expect(ok({ type: 'http', url: 'https://a.b/mcp', headers: { H: 'v' } })).toMatchObject({ url: 'https://a.b/mcp' })
  })
  it.each([
    ['not json', '{nope', /JSON/],
    ['an array', '[1]', /object/],
    ['no command or address', '{"type":"stdio"}', /command/],
    ['both', '{"command":"a","url":"http://x"}', /both/],
    ['a flag for a command', '{"command":"-rf"}', /command/],
    ['args that are not text', '{"command":"a","args":[1]}', /args/],
    ['env that is not text', '{"command":"a","env":{"A":1}}', /env/],
    ['a bad type', '{"type":"ws","command":"a"}', /type/],
    ['an address that is not http', '{"url":"file:///etc/passwd"}', /http/]
  ])('refuses %s', (_n, text, why) => {
    expect(() => prepareEntry(text)).toThrow(why)
  })
  it('refuses a text too large to be an entry', () => {
    expect(() => prepareEntry(JSON.stringify({ command: 'a', args: ['x'.repeat(200_000)] }))).toThrow(/large/)
  })
})

describe('writing an entry into a file, and only that', () => {
  const claude = JSON.stringify({ numStartups: 3, mcpServers: { a: { command: 'a' } }, projects: { '/w/p': { allowedTools: [], mcpServers: { b: { command: 'b' } } } } }, null, 2)
  const read = (t: string) => JSON.parse(t) as Record<string, any>
  it('adds, changes and removes in the list the entry is in, leaving the rest of the file as it was', () => {
    const added = read(editFile(claude, { kind: 'global' }, undefined, 'n', { command: 'n' }))
    expect(added.mcpServers).toEqual({ a: { command: 'a' }, n: { command: 'n' } })
    expect(added.numStartups).toBe(3)
    expect(added.projects['/w/p'].allowedTools).toEqual([])
    expect(read(editFile(claude, { kind: 'project', project: '/w/p' }, 'b', 'b', { command: 'b2' })).projects['/w/p'].mcpServers).toEqual({ b: { command: 'b2' } })
    expect(read(editFile(claude, { kind: 'global' }, 'a', null, null)).mcpServers).toEqual({})
  })
  it('renames by removing the old name, and refuses a name that is already in the list', () => {
    expect(read(editFile(claude, { kind: 'global' }, 'a', 'z', { command: 'a' })).mcpServers).toEqual({ z: { command: 'a' } })
    expect(() => editFile(claude, { kind: 'global' }, undefined, 'a', { command: 'x' })).toThrow(/already/)
    const two = JSON.stringify({ mcpServers: { a: { command: 'a' }, b: { command: 'b' } } })
    expect(() => editFile(two, { kind: 'file' }, 'a', 'b', { command: 'a' })).toThrow(/already/)
  })
  it('starts a file that is not there with the one list, and never writes over a file that is not JSON', () => {
    expect(read(editFile(null, { kind: 'file' }, undefined, 'n', { command: 'n' }))).toEqual({ mcpServers: { n: { command: 'n' } } })
    expect(() => editFile('{broken', { kind: 'file' }, undefined, 'n', { command: 'n' })).toThrow(/not valid JSON/)
    expect(() => editFile('[1]', { kind: 'file' }, undefined, 'n', { command: 'n' })).toThrow(/not valid JSON/)
  })
  it('keeps the file\'s own indentation and ends it with a newline', () => {
    const four = JSON.stringify({ mcpServers: {} }, null, 4)
    expect(editFile(four, { kind: 'file' }, undefined, 'n', { command: 'n' })).toMatch(/^\{\n {4}"mcpServers"/)
    expect(editFile(four, { kind: 'file' }, undefined, 'n', { command: 'n' }).endsWith('\n')).toBe(true)
  })
  it('refuses names that are not plain names, so one cannot reach __proto__ or another key', () => {
    for (const bad of ['__proto__', 'a b', '', '../x', 'a'.repeat(65)]) expect(() => editFile(claude, { kind: 'global' }, undefined, bad, { command: 'x' })).toThrow(/name/)
  })
})

describe('finding an entry as its file has it', () => {
  it('reads the entry of a server by where it is listed', () => {
    const file = JSON.stringify({ mcpServers: { a: { command: 'a', env: { T: 's' } } }, projects: { '/w/p': { mcpServers: { b: { command: 'b' } } } } })
    const read = () => file
    expect(findRaw(read, { where: 'global', path: '/f', name: 'a' })).toMatchObject({ env: { T: 's' } })
    expect(findRaw(read, { where: 'project', path: '/home/.claude.json', project: '/w/p', name: 'b' })).toEqual({ command: 'b' })
    expect(findRaw(read, { where: 'project', path: '/w/p/.mcp.json', project: '/w/p', name: 'a' })).toMatchObject({ command: 'a' })
    expect(findRaw(read, { where: 'global', path: '/f', name: 'missing' })).toBeNull()
  })
})

describe('turning on an entry its own file switched off', () => {
  const file = JSON.stringify({ numStartups: 2, mcpServers: { a: { command: 'a', disabled: true, env: { T: 's' } }, b: { command: 'b' } } }, null, 2)
  it('takes out the disabled flag and keeps the rest of the entry and of the file', () => {
    const out = JSON.parse(enableEntry(file, { kind: 'global' }, 'a')!)
    expect(out.mcpServers.a).toEqual({ command: 'a', env: { T: 's' } })
    expect(out.mcpServers.b).toEqual({ command: 'b' })
    expect(out.numStartups).toBe(2)
  })
  it('says nothing to write when the entry is not switched off, or is not there', () => {
    expect(enableEntry(file, { kind: 'global' }, 'b')).toBeNull()
    expect(enableEntry(file, { kind: 'global' }, 'missing')).toBeNull()
    expect(enableEntry('{broken', { kind: 'global' }, 'a')).toBeNull()
  })
})
