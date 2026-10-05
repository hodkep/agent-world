import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Prefs } from '../shared/types'

export const DEFAULT_PREFS: Prefs = { notifications: 'all', keepAwake: true, wrapUp: true, providers: {}, updateUrl: '', houseRules: '', roleModels: {}, defaults: { model: '', permissionMode: '', inPlace: false } }

const isMode = (v: unknown): v is Prefs['notifications'] => v === 'all' || v === 'attention' || v === 'off'
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** Anything unreadable or of the wrong kind falls back to the default, so a hand-edited file never breaks start-up. */
export function cleanPrefs(raw: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = (r.defaults && typeof r.defaults === 'object' ? r.defaults : {}) as Record<string, unknown>
  return {
    notifications: isMode(r.notifications) ? r.notifications : base.notifications,
    keepAwake: typeof r.keepAwake === 'boolean' ? r.keepAwake : base.keepAwake,
    wrapUp: typeof r.wrapUp === 'boolean' ? r.wrapUp : base.wrapUp,
    providers: cleanProviders(r, base.providers),
    updateUrl: str(r.updateUrl, 500)?.trim() ?? base.updateUrl,
    houseRules: str(r.houseRules, 4000) ?? base.houseRules,
    roleModels: cleanRoleModels(r.roleModels, base.roleModels),
    defaults: {
      model: str(d.model, 60) ?? base.defaults.model,
      permissionMode: str(d.permissionMode, 30) ?? base.defaults.permissionMode,
      inPlace: typeof d.inPlace === 'boolean' ? d.inPlace : base.defaults.inPlace
    }
  }
}

/** `providers.<id>.path`; a file saved before providers existed has only `claudePath`, which becomes claude's. */
function cleanProviders(r: Record<string, unknown>, base: Prefs['providers']): Prefs['providers'] {
  const out: Prefs['providers'] = {}
  const given = (r.providers && typeof r.providers === 'object' ? r.providers : {}) as Record<string, unknown>
  for (const id of ['claude', 'agy'] as const) {
    const o = given[id]
    const path = str(o && typeof o === 'object' ? (o as Record<string, unknown>).path : undefined, 500) ?? (id === 'claude' ? str(r.claudePath, 500) : undefined)
    const clean = path?.trim() ?? base[id]?.path
    if (clean) out[id] = { path: clean }
  }
  return out
}

function cleanRoleModels(raw: unknown, base: Record<string, string>) {
  if (!raw || typeof raw !== 'object') return base
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string' && v.trim() && k.length <= 60) out[k] = v.trim().slice(0, 60)
  return out
}

export function loadPrefs(file: string): Prefs {
  try {
    return existsSync(file) ? cleanPrefs(JSON.parse(readFileSync(file, 'utf8'))) : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(file: string, prefs: Prefs) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(prefs, null, 2))
  renameSync(tmp, file)
}
