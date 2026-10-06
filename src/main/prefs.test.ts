import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, cleanPrefs, loadPrefs, savePrefs } from './prefs'

describe('preferences', () => {
  it('start from the defaults when there is no file', () => {
    expect(loadPrefs(join(mkdtempSync(join(tmpdir(), 'aw-prefs-')), 'none.json'))).toEqual(DEFAULT_PREFS)
  })
  it('round-trip through the file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-prefs-')), 'p.json')
    const p = { ...DEFAULT_PREFS, notifications: 'attention' as const, providers: { claude: { path: '/opt/claude' } }, updateUrl: 'https://x.example/', defaults: { provider: 'agy' as const, model: 'haiku', permissionMode: 'plan', inPlace: true, accounts: { claude: 'work' } }, accounts: [{ id: 'work', name: 'Work', provider: 'claude' as const }] }
    savePrefs(file, p)
    expect(loadPrefs(file)).toEqual(p)
  })
  it('ignore values of the wrong kind, keeping the rest', () => {
    expect(cleanPrefs({ notifications: 'loud', keepAwake: 'yes', claudePath: ' /x/claude ', defaults: { inPlace: 1, model: 'sonnet' } })).toEqual({ ...DEFAULT_PREFS, providers: { claude: { path: '/x/claude' } }, defaults: { ...DEFAULT_PREFS.defaults, model: 'sonnet' } })
  })
  it('keep only accounts with a plain id and a name, once each', () => {
    expect(cleanPrefs({ accounts: [{ id: 'work', name: ' Work ' }, { id: 'work', name: 'Dup' }, { id: '../x', name: 'Bad' }, { id: 'ok', name: '' }, { id: 'x', name: 'X', provider: 'nope' }, 4] }).accounts).toEqual([{ id: 'work', name: 'Work', provider: 'claude' }])
  })
  it('keep house rules and the model chosen for each job, dropping empty entries', () => {
    const p = cleanPrefs({ houseRules: 'Small commits.', roleModels: { Reviewer: ' haiku ', Explorer: '', Bad: 4 } })
    expect(p.houseRules).toBe('Small commits.')
    expect(p.roleModels).toEqual({ Reviewer: 'haiku' })
  })
  it('move a saved claudePath to providers.claude.path, and keep each provider\'s own path', () => {
    expect(cleanPrefs({ claudePath: '/old/claude' }).providers).toEqual({ claude: { path: '/old/claude' } })
    expect(cleanPrefs({ claudePath: '/old/claude', providers: { claude: { path: '/new/claude' }, agy: { path: ' /bin/agy ' }, other: { path: '/x' } } }).providers).toEqual({ claude: { path: '/new/claude' }, agy: { path: '/bin/agy' } })
  })
  it('keep whether setup was finished and the default provider, ignoring an unknown provider', () => {
    expect(cleanPrefs({ setup: { done: true, defaultProvider: 'agy' } }).setup).toEqual({ done: true, defaultProvider: 'agy' })
    expect(cleanPrefs({ setup: { done: 'yes', defaultProvider: 'gemini' } }).setup).toEqual({ done: false, defaultProvider: '' })
  })
  it('survive a corrupt file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-prefs-')), 'bad.json')
    writeFileSync(file, '{nope')
    expect(loadPrefs(file)).toEqual(DEFAULT_PREFS)
  })
})
