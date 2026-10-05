import { describe, expect, it } from 'vitest'
import { homeDirName } from './home'

describe('the folder an installed copy keeps its data in', () => {
  it('is ~/.agent-world unless the package says otherwise, so a second build can keep its own', () => {
    expect(homeDirName('{"name":"agent-world"}')).toBe('.agent-world')
    expect(homeDirName('{"awHome":".agent-world-2"}')).toBe('.agent-world-2')
  })
  it('falls back to the usual folder for anything unreadable or unsafe', () => {
    for (const bad of ['', '{oops', '{"awHome":""}', '{"awHome":"../elsewhere"}', '{"awHome":"/abs"}', '{"awHome":"a/b"}', '{"awHome":5}']) expect(homeDirName(bad)).toBe('.agent-world')
  })
})
