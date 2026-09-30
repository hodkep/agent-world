import { describe, expect, it } from 'vitest'
import { descendants } from './procs'

const ps = `
  1     0 /sbin/launchd
 10     1 electron
 20    10 claude
 30    20 /bin/zsh -c npm run dev
 31    30 node vite
 40     1 unrelated
`

describe('descendants', () => {
  it('lists everything below the root, and nothing else', () => {
    expect(descendants(ps, 20)).toEqual([
      { pid: 30, command: '/bin/zsh -c npm run dev' },
      { pid: 31, command: 'node vite' }
    ])
  })
  it('is empty when nothing runs below', () => expect(descendants(ps, 31)).toEqual([]))
})
