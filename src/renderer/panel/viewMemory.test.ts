import { describe, expect, it } from 'vitest'
import { arriving, leaving } from './viewMemory'

describe('the panel tab each workspace was left on', () => {
  it('remembers the tab of the workspace being left, and gives it back on return', () => {
    const mem = leaving({}, '/work/a', 'code')
    expect(arriving(mem, '/work/a', 'chat')).toBe('code')
  })

  it('keeps each workspace’s own tab', () => {
    const mem = leaving(leaving({}, '/work/a', 'code'), '/work/b', 'preview')
    expect(arriving(mem, '/work/a', 'chat')).toBe('code')
    expect(arriving(mem, '/work/b', 'chat')).toBe('preview')
  })

  it('opens a workspace never seen before on the usual tab', () => {
    expect(arriving({ '/work/a': 'code' }, '/work/c', 'terminal')).toBe('terminal')
  })

  it('does not keep a tab that depends on the agent (a file) or on a setting', () => {
    expect(leaving({ '/work/a': 'code' }, '/work/a', 'file')).toEqual({ '/work/a': 'code' })
    expect(leaving({}, '/work/a', 'workflow')).toEqual({})
  })

  it('ignores a workspace with no path', () => {
    expect(leaving({}, null, 'code')).toEqual({})
  })
})
