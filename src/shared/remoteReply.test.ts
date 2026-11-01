import { describe, expect, it } from 'vitest'
import { codeOf, mentionedCode, parseAnswers, parseReply } from './remoteReply'

describe('codeOf', () => {
  it('is three lowercase letters or digits, the same for the same thing and different for another', () => {
    expect(codeOf('plan:run1:1700000000')).toMatch(/^[a-z0-9]{3}$/)
    expect(codeOf('plan:run1:1700000000')).toBe(codeOf('plan:run1:1700000000'))
    expect(codeOf('plan:run1:1700000000')).not.toBe(codeOf('plan:run1:1700000001'))
  })
})

const WORDS = ['approve', 'changes', 'release', 'seen', 'plan', 'aside', 'allow', 'decline']

describe('parseReply: a decision is exactly a word, a code, and what the word takes', () => {
  it('reads each word with its code, in any case, with spaces around', () => {
    expect(parseReply('approve 7k2', WORDS)).toEqual({ verb: 'approve', code: '7k2', rest: '' })
    expect(parseReply('  Allow 7K2  ', WORDS)).toEqual({ verb: 'allow', code: '7k2', rest: '' })
    expect(parseReply('decline abc', WORDS)).toEqual({ verb: 'decline', code: 'abc', rest: '' })
    expect(parseReply('release 7k2', WORDS)).toEqual({ verb: 'release', code: '7k2', rest: '' })
  })
  it('takes a note after a colon for changes, and a list or answers after a space for the others', () => {
    expect(parseReply('changes 7k2: use a flag, not a setting', WORDS)).toEqual({ verb: 'changes', code: '7k2', rest: 'use a flag, not a setting' })
    expect(parseReply('seen 7k2 1,3', WORDS)).toEqual({ verb: 'seen', code: '7k2', rest: '1,3' })
    expect(parseReply('plan 7k2 2', WORDS)).toEqual({ verb: 'plan', code: '7k2', rest: '2' })
    expect(parseReply('approve 7k2 1=2, 2=Warm', WORDS)).toEqual({ verb: 'approve', code: '7k2', rest: '1=2, 2=Warm' })
  })
  it('only knows the words it is given: a word no waiting decision lists is nothing', () => {
    expect(parseReply('approve 7k2', ['allow'])).toBeNull()
    expect(parseReply('nap 7k2', ['nap'])).toEqual({ verb: 'nap', code: '7k2', rest: '' })
    expect(parseReply('approve 7k2', [])).toBeNull()
  })
  it('is nothing for anything else: a typo, no code, a code of the wrong shape, or words around it', () => {
    expect(parseReply('Apptoved 7k2', WORDS)).toBeNull()
    expect(parseReply('approve', WORDS)).toBeNull()
    expect(parseReply('approve 7k', WORDS)).toBeNull()
    expect(parseReply('approve 7k2x', WORDS)).toBeNull()
    expect(parseReply('please approve 7k2', WORDS)).toBeNull()
    expect(parseReply('approve it, 7k2 is fine', WORDS)).toBeNull()
    expect(parseReply('', WORDS)).toBeNull()
  })
})

describe('parseAnswers: "1=2, 2=Warm" is question 1 answered with option 2 and question 2 with the words', () => {
  it('reads number=value pairs split by commas', () => {
    expect(parseAnswers('1=2, 2=Warm')).toEqual([{ n: 1, value: '2' }, { n: 2, value: 'Warm' }])
    expect(parseAnswers('')).toEqual([])
    expect(parseAnswers('1=Every window')).toEqual([{ n: 1, value: 'Every window' }])
  })
  it('is null when something is not a pair, so a wrong reply is refused whole', () => {
    expect(parseAnswers('1=2, whatever')).toBeNull()
  })
})

describe('mentionedCode: a message that names a waiting code but is not a decision', () => {
  it('finds a waiting code used as a word, and none otherwise', () => {
    expect(mentionedCode('Apptoved 7k2', ['7k2', 'abc'])).toBe('7k2')
    expect(mentionedCode('yes do it', ['7k2'])).toBeNull()
    expect(mentionedCode('abc7k2def', ['7k2'])).toBeNull()
  })
})
