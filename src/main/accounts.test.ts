import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountDir, accountId, configDirFor, parseAuthStatus, prepareAccount, shareSession } from './accounts'

const tmp = () => mkdtempSync(join(tmpdir(), 'aw-acct-'))

describe('accounts', () => {
  it('keeps each account in a folder of its own under the app home', () => {
    expect(accountDir('/h', 'work')).toBe('/h/accounts/work')
  })

  it('names no folder for this computer\'s own login, or for an account that is gone', () => {
    const list = [{ id: 'work', name: 'Work' }]
    expect(configDirFor('/h', list, undefined)).toBeUndefined()
    expect(configDirFor('/h', list, '')).toBeUndefined()
    expect(configDirFor('/h', list, 'gone')).toBeUndefined()
    expect(configDirFor('/h', list, 'work')).toBe('/h/accounts/work')
  })

  it('makes a folder-safe id and never reuses one', () => {
    expect(accountId('Work Team!', [])).toBe('work-team')
    expect(accountId('Work', ['work'])).toBe('work-2')
    expect(accountId('???', [])).toBe('account')
  })

  it('reads who is signed in, and treats junk as signed out', () => {
    expect(parseAuthStatus('{"loggedIn":true,"email":"a@b.c"}')).toEqual({ loggedIn: true, email: 'a@b.c' })
    expect(parseAuthStatus('{"loggedIn":false}')).toEqual({ loggedIn: false, email: '' })
    expect(parseAuthStatus('not json')).toEqual({ loggedIn: false, email: '' })
  })

  it('links the shared files into a new account and never touches the sign-in', async () => {
    const claude = tmp()
    writeFileSync(join(claude, 'CLAUDE.md'), 'rules')
    mkdirSync(join(claude, 'skills'))
    writeFileSync(join(claude, '.credentials.json'), 'secret')
    const dir = join(tmp(), 'work')
    await prepareAccount(dir, claude)
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('rules')
    expect(lstatSync(join(dir, 'skills')).isSymbolicLink()).toBe(true)
    expect(existsSync(join(dir, 'commands'))).toBe(false)
    expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
    await prepareAccount(dir, claude)
  })

  it('makes a conversation appear in the other account as a link, once', () => {
    const a = tmp()
    const b = tmp()
    mkdirSync(join(a, 'slug'))
    writeFileSync(join(a, 'slug', 's1.jsonl'), 'chat')
    shareSession(a, b, 'slug', 's1')
    expect(readlinkSync(join(b, 'slug', 's1.jsonl'))).toBe(join(a, 'slug', 's1.jsonl'))
    shareSession(a, b, 'slug', 's1')
    shareSession(a, b, 'slug', 'missing')
    expect(existsSync(join(b, 'slug', 'missing.jsonl'))).toBe(false)
  })
})
