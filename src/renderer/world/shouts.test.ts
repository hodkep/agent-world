import { describe, expect, it } from 'vitest'
import { Shouts } from './shouts'

describe('short shouts over people', () => {
  it('shows a shout where its anchor says, for as long as it was asked for, then drops it', () => {
    const s = new Shouts()
    s.say('help', 'HELP!', 1200, () => ({ x: 10, y: 20 }))
    expect(s.active()).toEqual([{ text: 'HELP!', x: 10, y: 20 }])
    s.update(1100)
    expect(s.active()).toHaveLength(1)
    s.update(200)
    expect(s.active()).toEqual([])
  })

  it('follows whoever it is over, as they move', () => {
    const s = new Shouts()
    let x = 0
    s.say('a', 'HELP!', 1000, () => ({ x, y: 5 }))
    x = 30
    expect(s.active()[0]!.x).toBe(30)
  })

  it('does not shout twice at once for the same thing, so three subagents starting together get one shout', () => {
    const s = new Shouts()
    for (let i = 0; i < 3; i++) s.say('help:ada', 'HELP!', 1200, () => ({ x: 1, y: 1 }))
    expect(s.active()).toHaveLength(1)
    // Once it is over, the next one is heard.
    s.update(1300)
    s.say('help:ada', 'HELP!', 1200, () => ({ x: 1, y: 1 }))
    expect(s.active()).toHaveLength(1)
  })

  it('drops a shout whose person has gone', () => {
    const s = new Shouts()
    let gone = false
    s.say('a', 'HELP!', 5000, () => (gone ? null : { x: 1, y: 1 }))
    gone = true
    expect(s.active()).toEqual([])
    s.update(16)
    expect(s.size).toBe(0)
  })

  it('keeps different shouts apart', () => {
    const s = new Shouts()
    s.say('a', 'HELP!', 1000, () => ({ x: 1, y: 1 }))
    s.say('b', 'WHOA!', 1000, () => ({ x: 2, y: 2 }))
    expect(s.active().map((x) => x.text)).toEqual(['HELP!', 'WHOA!'])
  })
})
