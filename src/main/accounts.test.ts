import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Account, AgentRecord } from '../shared/types'
import { AccountService, accountDir, accountId, prepareAccount } from './accounts'
import type { AccountSupport, Provider } from './providers/ports'

const tmp = () => mkdtempSync(join(tmpdir(), 'aw-acct-'))

/** A made-up program: the service must work with whatever offers `accounts`, not just Claude. */
const fake = (own: string, over: Partial<AccountSupport> = {}): AccountSupport => ({
  ownHome: () => own,
  shared: ['NOTES.md', 'skills'],
  env: (dir) => ({ FAKE_HOME: dir }),
  signInArgs: ['login'],
  status: async () => ({ loggedIn: true, email: 'a@b.c' }),
  shareConversation: () => undefined,
  ...over
})
const provider = (id: string, accounts?: AccountSupport) => ({ id, accounts }) as unknown as Provider
const agent = (over: Partial<AgentRecord> = {}) => ({ id: 'a', provider: 'claude', cwd: '/x', sessionId: 's', started: true, ...over }) as AgentRecord

describe('accounts', () => {
  it('keeps each account in a folder of its own under the app home', () => {
    expect(accountDir('/h', 'work')).toBe('/h/accounts/work')
  })

  it('makes a folder-safe id and never reuses one', () => {
    expect(accountId('Work Team!', [])).toBe('work-team')
    expect(accountId('Work', ['work'])).toBe('work-2')
    expect(accountId('???', [])).toBe('account')
  })

  it('links what the program shares into a new account and never touches the sign-in', async () => {
    const own = tmp()
    writeFileSync(join(own, 'NOTES.md'), 'rules')
    mkdirSync(join(own, 'skills'))
    writeFileSync(join(own, '.credentials.json'), 'secret')
    const dir = join(tmp(), 'work')
    await prepareAccount(dir, fake(own))
    expect(readFileSync(join(dir, 'NOTES.md'), 'utf8')).toBe('rules')
    expect(lstatSync(join(dir, 'skills')).isSymbolicLink()).toBe(true)
    expect(existsSync(join(dir, '.credentials.json'))).toBe(false)
    await prepareAccount(dir, fake(own))
  })
})

describe('AccountService', () => {
  const work: Account = { id: 'work', name: 'Work', provider: 'claude' }
  const svc = (accounts: Account[] = [work], support: AccountSupport | undefined = fake('/own')) =>
    new AccountService({ home: '/h', providers: () => [provider('claude', support), provider('agy')], accounts: () => accounts, ownNames: () => ({}) })

  it('names no folder for the program\'s own login, an account that is gone, one of another program, or a program without accounts', () => {
    expect(svc().dirOf('claude', undefined)).toBeUndefined()
    expect(svc().dirOf('claude', '')).toBeUndefined()
    expect(svc().dirOf('claude', 'gone')).toBeUndefined()
    expect(svc([{ ...work, provider: 'agy' }]).dirOf('claude', 'work')).toBeUndefined()
    expect(svc([{ ...work, provider: 'agy' }]).dirOf('agy', 'work')).toBeUndefined()
    expect(svc().dirOf('claude', 'work')).toBe('/h/accounts/work')
  })

  it('points the program at a folder the way the program says, and adds nothing for its own login', () => {
    expect(svc().envFor('claude', '/h/accounts/work')).toEqual({ FAKE_HOME: '/h/accounts/work' })
    expect(svc().envFor('claude', undefined)).toEqual({})
    expect(svc().envFor('agy', '/h/accounts/work')).toEqual({})
  })

  it('puts an agent on an account and back on its own login', () => {
    const a = agent()
    svc().assign(a, 'work')
    expect(a).toMatchObject({ account: 'work', configDir: '/h/accounts/work' })
    svc().assign(a, '')
    expect(a.account).toBeUndefined()
    expect(a.configDir).toBeUndefined()
  })

  it('moves a conversation through the program, only once it has started', () => {
    const share = vi.fn()
    const s = svc([work], fake('/own', { shareConversation: share }))
    const a = agent({ started: false })
    s.moveConversation(a, 'work')
    expect(share).not.toHaveBeenCalled()
    a.started = true
    s.moveConversation(a, '')
    expect(share).toHaveBeenCalledWith(a, '/h/accounts/work', undefined)
  })

  it('refuses a program without accounts, an empty name and a repeated one', async () => {
    const own = tmp()
    const s = new AccountService({ home: tmp(), providers: () => [provider('claude', fake(own)), provider('agy')], accounts: () => [work], ownNames: () => ({}) })
    await expect(s.create('agy', 'X')).rejects.toThrow('does not keep')
    await expect(s.create('claude', '  ')).rejects.toThrow('name')
    await expect(s.create('claude', 'work')).rejects.toThrow('exists')
    expect(await s.create('claude', 'Client')).toEqual({ id: 'client', name: 'Client', provider: 'claude' })
  })
})

describe('AccountService lists and removes', () => {
  const work: Account = { id: 'work', name: 'Work', provider: 'claude' }
  const svc = () => new AccountService({ home: '/h', providers: () => [provider('claude', fake('/own')), provider('agy')], accounts: () => [work], ownNames: () => ({}) })

  it('lists each login of each program that keeps accounts, with who is signed in and its agents', async () => {
    const rows = await svc().list([agent({ account: 'work' }), agent({ id: 'b' })], () => 'bin', {})
    expect(rows.map((r) => [r.provider, r.id, r.agents, r.email])).toEqual([['claude', '', 1, 'a@b.c'], ['claude', 'work', 1, 'a@b.c']])
  })

  it('refuses to remove an account an agent still runs on, and says who', () => {
    expect(() => svc().without('work', [agent({ name: 'ada', account: 'work' })])).toThrow('ada still runs on it')
    expect(svc().without('work', [agent()])).toEqual([])
  })

  it('renames an account: the label changes, its id, folder and program do not, and a name is trimmed, kept to forty characters and never taken by another account of the program', () => {
    const two = [work, { id: 'home', name: 'Home', provider: 'claude' as const }]
    const s = new AccountService({ home: '/h', providers: () => [provider('claude', fake('/own')), provider('agy')], accounts: () => two, ownNames: () => ({}) })
    expect(s.rename('work', '  Day job  ')).toEqual([{ id: 'work', name: 'Day job', provider: 'claude' }, two[1]])
    expect(s.rename('work', 'x'.repeat(60))[0]!.name).toHaveLength(40)
    expect(s.rename('work', 'WORK')[0]!.name).toBe('WORK')
    expect(() => s.rename('work', ' home ')).toThrow('An account with that name exists.')
    expect(() => s.rename('work', '   ')).toThrow('Give the account a name.')
    expect(() => s.rename('gone', 'Other')).toThrow('That account was removed.')
  })

  it('names the program\'s own login like any account: a stored name shows in the list, and renaming it follows the same rules as for the others', async () => {
    const two = [work, { id: 'home', name: 'Home', provider: 'claude' as const }]
    const names = { claude: 'Laptop' }
    const s = new AccountService({ home: '/h', providers: () => [provider('claude', fake('/own')), provider('agy', fake('/agy'))], accounts: () => two, ownNames: () => names })
    expect((await s.list([], () => 'bin', {})).filter((r) => r.id === '').map((r) => [r.provider, r.name])).toEqual([['claude', 'Laptop'], ['agy', 'This computer']])
    expect(s.renameOwn('claude', '  Day laptop  ')).toEqual({ claude: 'Day laptop' })
    expect(s.renameOwn('agy', 'Work')).toEqual({ claude: 'Laptop', agy: 'Work' })
    expect(() => s.renameOwn('claude', ' WORK ')).toThrow('An account with that name exists.')
    expect(() => s.renameOwn('claude', '   ')).toThrow('Give the account a name.')
    expect(() => s.rename('work', 'laptop')).toThrow('An account with that name exists.')
    // The built-in default is a name too: nobody can take it for another account of the program.
    expect(() => s.rename('home', 'this computer')).not.toThrow()
    expect(() => new AccountService({ home: '/h', providers: () => [provider('claude', fake('/own'))], accounts: () => two, ownNames: () => ({}) }).rename('home', 'This computer')).toThrow('An account with that name exists.')
  })

  it('signs the program\'s own login in the usual way and an account in its own folder', () => {
    expect(svc().signIn('claude', '')).toEqual({ env: {}, args: [] })
    expect(svc().signIn('claude', 'work')).toEqual({ env: { FAKE_HOME: '/h/accounts/work' }, args: ['login'] })
    expect(() => svc().signIn('agy', '')).toThrow('does not keep')
  })

  it('looks for the account folders where AW_ACCOUNTS_DIR says, else under the app\'s home', () => {
    const was = process.env.AW_ACCOUNTS_DIR
    try {
      delete process.env.AW_ACCOUNTS_DIR
      expect(accountDir('/home/aw', 'work')).toBe('/home/aw/accounts/work')
      process.env.AW_ACCOUNTS_DIR = '/elsewhere/accounts'
      expect(accountDir('/home/aw', 'work')).toBe('/elsewhere/accounts/work')
    } finally {
      if (was === undefined) delete process.env.AW_ACCOUNTS_DIR
      else process.env.AW_ACCOUNTS_DIR = was
    }
  })
})
