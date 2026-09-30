import { describe, expect, it } from 'vitest'
import { findLocalServers } from './servers'

describe('finding dev servers in terminal output', () => {
  it('reads the address a dev server prints', () => {
    expect(findLocalServers('  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host')).toEqual([{ port: 5173, url: 'http://localhost:5173/' }])
    expect(findLocalServers('ready - started server on 0.0.0.0:3000, url: http://localhost:3000')).toEqual([{ port: 3000, url: 'http://localhost:3000/' }])
  })

  it('treats 127.0.0.1, 0.0.0.0 and [::1] as localhost and keeps a path', () => {
    expect(findLocalServers('listening on http://127.0.0.1:8080/app?x=1')).toEqual([{ port: 8080, url: 'http://localhost:8080/app?x=1' }])
    expect(findLocalServers('http://0.0.0.0:4000/ and http://[::1]:4001/')).toEqual([
      { port: 4000, url: 'http://localhost:4000/' },
      { port: 4001, url: 'http://localhost:4001/' }
    ])
  })

  it('finds each port once, ignores other hosts and the office\'s own ports', () => {
    const text = 'http://localhost:5173/ http://localhost:5173/ http://example.com:8080/ https://localhost:9999/'
    expect(findLocalServers(text, [9999])).toEqual([{ port: 5173, url: 'http://localhost:5173/' }])
  })

  it('skips ports that cannot be a server', () => {
    expect(findLocalServers('http://localhost:80/ http://localhost:99999/ http://localhost:22/')).toEqual([])
  })

  it('sees through terminal colour codes', () => {
    expect(findLocalServers('Local: \x1b[36mhttp://localhost:\x1b[1m5174\x1b[22m/\x1b[0m')).toEqual([{ port: 5174, url: 'http://localhost:5174/' }])
  })
})
