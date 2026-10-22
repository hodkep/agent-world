import { describe, expect, it } from 'vitest'
import { fileAccess } from './fileAccess'

describe('fileAccess: what a file question says, from the program\'s own words', () => {
  it('a read: the kind, the path and why it asks', () => {
    expect(fileAccess('Read', 'Read: /private/etc/hosts\nReason: outside workspace')).toEqual({ kind: 'READ', path: '/private/etc/hosts', reason: 'outside workspace', diff: [], summary: '' })
  })
  it('a new file: the path, its size and the lines it would have', () => {
    expect(fileAccess('Create', '/private/tmp/x/x.txt  +1\n1  +  hi\nReason: outside workspace')).toEqual({ kind: 'NEW FILE', path: '/private/tmp/x/x.txt', reason: 'outside workspace', diff: [{ sign: '+', text: 'hi', n: 1 }], summary: '+1' })
  })
  it('an edit: what was removed and what was put in, and none of the program\'s hints', () => {
    const f = fileAccess('Edit', '/p/x.txt  +1 -1\n1  -  hi\n1  +  hello\nshift+tab to auto-approve file edits')
    expect(f).toEqual({ kind: 'EDIT', path: '/p/x.txt', reason: '', diff: [{ sign: '-', text: 'hi', n: 1 }, { sign: '+', text: 'hello', n: 1 }], summary: '+1 -1' })
  })
  it('anything else is still a card: the tool named, the words shown as they are', () => {
    expect(fileAccess('Delete', 'whatever it says')).toEqual({ kind: 'DELETE', path: 'whatever it says', reason: '', diff: [], summary: '' })
  })
})
