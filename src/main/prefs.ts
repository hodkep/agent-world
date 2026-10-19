import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isWorkflowId } from '../shared/workflow'
import { isDial } from '../shared/workflows'
import { DEFAULT_PROVIDER, PROVIDER_IDS, type Prefs, isProviderId } from '../shared/types'

export const DEFAULT_PREFS: Prefs = { notifications: 'all', keepAwake: true, wrapUp: true, openPagesInApp: true, todoTracking: 'deferred', libraryEnabled: true, subagents: { maxDepth: 2, maxRunning: 3 }, setup: { done: false, defaultProvider: '' }, providers: {}, updateUrl: '', seenVersion: '', houseRules: '', roleModels: {}, defaults: { provider: '', model: '', permissionMode: '', inPlace: false, accounts: {} }, accounts: [], workflows: { enabled: false, dial: 'balanced', since: 0, planGate: true, mergeGate: true, defaults: {} } }

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
    openPagesInApp: typeof r.openPagesInApp === 'boolean' ? r.openPagesInApp : base.openPagesInApp,
    libraryEnabled: typeof r.libraryEnabled === 'boolean' ? r.libraryEnabled : base.libraryEnabled,
    todoTracking: r.todoTracking === 'full' || r.todoTracking === 'deferred' ? r.todoTracking : base.todoTracking,
    subagents: cleanSubagents(r.subagents, base.subagents),
    setup: cleanSetup(r.setup, base.setup),
    providers: cleanProviders(r, base.providers),
    updateUrl: str(r.updateUrl, 500)?.trim() ?? base.updateUrl,
    seenVersion: typeof r.seenVersion === 'string' && r.seenVersion.length <= 40 ? r.seenVersion.trim() : base.seenVersion,
    houseRules: str(r.houseRules, 4000) ?? base.houseRules,
    roleModels: cleanRoleModels(r.roleModels, base.roleModels),
    defaults: {
      provider: isProviderId(d.provider) ? d.provider : base.defaults.provider,
      model: str(d.model, 60) ?? base.defaults.model,
      permissionMode: str(d.permissionMode, 30) ?? base.defaults.permissionMode,
      inPlace: typeof d.inPlace === 'boolean' ? d.inPlace : base.defaults.inPlace,
      accounts: cleanDefaultAccounts(d.accounts, base.defaults.accounts)
    },
    accounts: cleanAccounts(r.accounts, base.accounts),
    workflows: cleanWorkflows(r.workflows, base.workflows)
  }
}

const whole = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : fallback)

function cleanSubagents(raw: unknown, base: Prefs['subagents']): Prefs['subagents'] {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { maxDepth: whole(s.maxDepth, 1, 4, base.maxDepth), maxRunning: whole(s.maxRunning, 1, 10, base.maxRunning) }
}

/** The per-project default workflows that are a folder and a plain workflow id; anything else is dropped. */
function cleanDefaults(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => k && isWorkflowId(v)).slice(0, 200)) as Record<string, string>
}

function cleanWorkflows(raw: unknown, base: Prefs['workflows']): Prefs['workflows'] {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return { enabled: typeof w.enabled === 'boolean' ? w.enabled : base.enabled, dial: isDial(w.dial) ? w.dial : base.dial, since: typeof w.since === 'number' && w.since >= 0 ? w.since : base.since, planGate: typeof w.planGate === 'boolean' ? w.planGate : base.planGate, mergeGate: typeof w.mergeGate === 'boolean' ? w.mergeGate : base.mergeGate, defaults: cleanDefaults(w.defaults) }
}

function cleanSetup(raw: unknown, base: Prefs['setup']): Prefs['setup'] {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    done: typeof s.done === 'boolean' ? s.done : base.done,
    defaultProvider: s.defaultProvider === '' || isProviderId(s.defaultProvider) ? s.defaultProvider : base.defaultProvider
  }
}

/** `providers.<id>.path`; a file saved before providers existed has only `claudePath`, which becomes claude's. */
function cleanProviders(r: Record<string, unknown>, base: Prefs['providers']): Prefs['providers'] {
  const out: Prefs['providers'] = {}
  const given = (r.providers && typeof r.providers === 'object' ? r.providers : {}) as Record<string, unknown>
  for (const id of PROVIDER_IDS) {
    const o = given[id]
    const path = str(o && typeof o === 'object' ? (o as Record<string, unknown>).path : undefined, 500) ?? (id === DEFAULT_PROVIDER ? str(r.claudePath, 500) : undefined)
    const clean = path?.trim() ?? base[id]?.path
    if (clean) out[id] = { path: clean }
  }
  return out
}

/** Ids become folder names, so only plain ones survive; a repeated id keeps its first. */
function cleanAccounts(raw: unknown, base: Prefs['accounts']): Prefs['accounts'] {
  if (!Array.isArray(raw)) return base
  const out: Prefs['accounts'] = []
  for (const o of raw) {
    const id = str(o?.id, 40)
    const name = str(o?.name, 40)?.trim()
    // An account saved before programs had their own belongs to Claude.
    const provider = o?.provider === undefined ? DEFAULT_PROVIDER : isProviderId(o.provider) ? o.provider : null
    if (id && name && provider && /^[a-z0-9][a-z0-9-]*$/.test(id) && !out.some((x) => x.id === id)) out.push({ id, name, provider })
  }
  return out
}

function cleanDefaultAccounts(raw: unknown, base: Prefs['defaults']['accounts']): Prefs['defaults']['accounts'] {
  if (!raw || typeof raw !== 'object') return base
  const out: Prefs['defaults']['accounts'] = {}
  for (const id of PROVIDER_IDS) {
    const v = str((raw as Record<string, unknown>)[id], 40)
    if (v) out[id] = v
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
