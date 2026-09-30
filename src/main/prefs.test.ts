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
    const p = { ...DEFAULT_PREFS, notifications: 'attention' as const, claudePath: '/opt/claude', updateUrl: 'https://x.example/', defaults: { model: 'haiku', permissionMode: 'plan', inPlace: true } }
    savePrefs(file, p)
    expect(loadPrefs(file)).toEqual(p)
  })
  it('ignore values of the wrong kind, keeping the rest', () => {
    expect(cleanPrefs({ notifications: 'loud', keepAwake: 'yes', claudePath: ' /x/claude ', defaults: { inPlace: 1, model: 'sonnet' } })).toEqual({ ...DEFAULT_PREFS, claudePath: '/x/claude', defaults: { ...DEFAULT_PREFS.defaults, model: 'sonnet' } })
  })
  it('survive a corrupt file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aw-prefs-')), 'bad.json')
    writeFileSync(file, '{nope')
    expect(loadPrefs(file)).toEqual(DEFAULT_PREFS)
  })
})
