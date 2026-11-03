import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { keyStore, keychainUsable, type KeyCrypto } from './key'

// A stand-in for the keychain: it scrambles the text so a test can tell stored bytes from the plain key.
const fake = (available = true): KeyCrypto => ({
  isAvailable: () => available,
  encrypt: (s) => Buffer.from(Buffer.from([...s].reverse().join(''), 'utf8').map((b) => b ^ 0x5a)),
  decrypt: (b) => [...Buffer.from(Buffer.from(b).map((x) => x ^ 0x5a)).toString('utf8')].reverse().join('')
})
const file = () => join(mkdtempSync(join(tmpdir(), 'aw-voice-')), 'voice-key.bin')

describe('the Gemini key store', () => {
  it('has no key until one is saved', () => {
    const s = keyStore(file(), fake())
    expect([s.get() !== null, s.get()]).toEqual([false, null])
  })
  it('can tell a saved key it cannot read from no key at all', () => {
    const f = file()
    const s = keyStore(f, fake())
    expect(s.exists()).toBe(false)
    s.set('AIzaTestKey123')
    expect(s.exists()).toBe(true)
    const locked = keyStore(f, { ...fake(), decrypt: () => { throw new Error('denied') } })
    expect([locked.exists(), locked.get()]).toEqual([true, null])
    s.clear()
    expect(s.exists()).toBe(false)
  })
  it('keeps the key so that only the keychain can read it back', () => {
    const f = file()
    const s = keyStore(f, fake())
    s.set('AIzaTestKey123')
    expect(readFileSync(f).toString('latin1')).not.toContain('AIzaTestKey123')
    expect([s.get() !== null, s.get()]).toEqual([true, 'AIzaTestKey123'])
    expect(keyStore(f, fake()).get()).toBe('AIzaTestKey123')
  })
  it('keeps the file to its owner', () => {
    const f = file()
    keyStore(f, fake()).set('AIzaTestKey123')
    expect(statSync(f).mode & 0o077).toBe(0)
  })
  it('forgets the key when cleared', () => {
    const f = file()
    const s = keyStore(f, fake())
    s.set('AIzaTestKey123')
    s.clear()
    expect([s.get() !== null, existsSync(f)]).toEqual([false, false])
  })
  it('refuses to save when the keychain is not available, and writes nothing', () => {
    const f = file()
    expect(() => keyStore(f, fake(false)).set('AIzaTestKey123')).toThrow(/keychain/i)
    expect(existsSync(f)).toBe(false)
  })
  it('reads nothing from a file the keychain cannot open', () => {
    const f = file()
    keyStore(f, fake()).set('AIzaTestKey123')
    const broken: KeyCrypto = { ...fake(), decrypt: () => { throw new Error('bad') } }
    expect(keyStore(f, broken).get()).toBeNull()
  })
})

describe('when the keychain can be trusted with the key', () => {
  it('is when the system has one, but not when Linux falls back to its built-in password, which hides nothing', () => {
    expect([keychainUsable(true, undefined), keychainUsable(true, 'gnome_libsecret'), keychainUsable(true, 'kwallet6')]).toEqual([true, true, true])
    expect([keychainUsable(true, 'basic_text'), keychainUsable(false, undefined)]).toEqual([false, false])
  })
})
