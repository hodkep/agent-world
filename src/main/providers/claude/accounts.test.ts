import { existsSync, mkdirSync, mkdtempSync, readlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeAccounts, parseAuthStatus, shareSession } from './accounts'

const tmp = () => mkdtempSync(join(tmpdir(), 'aw-cacct-'))

describe('claude accounts', () => {
  it('reads who is signed in, and treats junk as signed out', () => {
    expect(parseAuthStatus('{"loggedIn":true,"email":"a@b.c"}')).toEqual({ loggedIn: true, email: 'a@b.c' })
    expect(parseAuthStatus('{"loggedIn":false}')).toEqual({ loggedIn: false, email: '' })
    expect(parseAuthStatus('not json')).toEqual({ loggedIn: false, email: '' })
  })

  it('asks claude itself, under the account folder it was given', async () => {
    let seen: { args: string[]; env: NodeJS.ProcessEnv } | null = null
    const got = await claudeAccounts.status('claude', { CLAUDE_CONFIG_DIR: '/w' }, async (_f, args, env) => ((seen = { args, env }), '{"loggedIn":true,"email":"w@x.y"}'))
    expect(got).toEqual({ loggedIn: true, email: 'w@x.y' })
    expect(seen).toMatchObject({ args: ['auth', 'status'], env: { CLAUDE_CONFIG_DIR: '/w' } })
    expect(claudeAccounts.env('/w')).toEqual({ CLAUDE_CONFIG_DIR: '/w' })
  })

  it('makes a conversation appear in the other folder as a link, once', () => {
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
