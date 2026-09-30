import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Prefs } from '../shared/types'

export const DEFAULT_PREFS: Prefs = { notifications: 'all', keepAwake: true, claudePath: '', defaults: { model: '', permissionMode: '', inPlace: false } }

const isMode = (v: unknown): v is Prefs['notifications'] => v === 'all' || v === 'attention' || v === 'off'
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** Anything unreadable or of the wrong kind falls back to the default, so a hand-edited file never breaks start-up. */
export function cleanPrefs(raw: unknown, base: Prefs = DEFAULT_PREFS): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = (r.defaults && typeof r.defaults === 'object' ? r.defaults : {}) as Record<string, unknown>
  return {
    notifications: isMode(r.notifications) ? r.notifications : base.notifications,
    keepAwake: typeof r.keepAwake === 'boolean' ? r.keepAwake : base.keepAwake,
    claudePath: str(r.claudePath, 500)?.trim() ?? base.claudePath,
    defaults: {
      model: str(d.model, 60) ?? base.defaults.model,
      permissionMode: str(d.permissionMode, 30) ?? base.defaults.permissionMode,
      inPlace: typeof d.inPlace === 'boolean' ? d.inPlace : base.defaults.inPlace
    }
  }
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
