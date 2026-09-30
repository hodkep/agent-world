import { describe, expect, it } from 'vitest'
import { descendants } from './procs'

const ps = `
  1     0    99:00 /sbin/launchd
 10     1    99:00 electron
 20    10    12:00 claude
 30    20    01:10 /bin/zsh -c npm run dev
 31    30    01:09 node vite
 32    20    12:00 node /x/mcp-server-supabase
 33    32    12:00 node helper
 34    20    00:01 /bin/zsh -c sleep 1
 35    20    05:00 /bin/zsh -c echo done
 40     1    99:00 unrelated
`

describe('descendants', () => {
  it('lists what commands under a shell left running, not the shell wrapper, MCP servers or new starters', () => {
    expect(descendants(ps, 20)).toEqual([
      { pid: 31, command: 'node vite' },
      { pid: 35, command: '/bin/zsh -c echo done' }
    ])
  })
  it('is empty when nothing runs below', () => expect(descendants(ps, 31)).toEqual([]))
})
