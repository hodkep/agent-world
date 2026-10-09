import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tokens } from './doc'
import type { Item } from './store'

import type { PlaybookFeatures, PlaybookRule, RuleMode, RuleStrength } from '../../shared/library'
export type Mode = RuleMode
export type Strength = RuleStrength
export type Rule = PlaybookRule

/** What the text added at launch may cost every turn. */
export const CORE_BUDGET = 300
/** An always-on item this short goes into the text itself; a longer one is read once at the start instead. */
export const INLINE_MAX = 300

/** Playbooks from the broadest to the most specific: a later rule for the same item replaces the earlier one. */
export function merge(...levels: Rule[][]): Rule[] {
  const out = new Map<string, Rule>()
  for (const level of levels) for (const r of level) out.set(r.id, r)
  return [...out.values()]
}

export interface Compiled {
  /** The text added when the agent starts. */
  core: string
  coreTokens: number
  overBudget: boolean
  /** Every item the agent may ask for (all that are not off and exist). */
  indexIds: string[]
  /** The skills Claude can load natively. */
  skills: Item[]
  /** The line added to a message that points at something: every medium and hard rule. */
  reminder: string
  /** The line added to every message, even one that matches nothing: the hard rules only. */
  hardReminder: string
  /** What the forced check adds to a message, in tokens (0 when no rule is hard); it is added only when the feature is on. */
  forcedCheckTokens: number
}

/** What an agent is told for a playbook: the opening text, what it may fetch, and the reminder. `canFetch` is whether it can reach the library tools. */
export function compile(rules: Rule[], items: Map<string, Item>, o: { canFetch: boolean; forcedCheck?: boolean }): Compiled {
  const live = rules.filter((r) => r.mode !== 'off' && items.has(r.id))
  const always = live.filter((r) => r.mode === 'always')
  const onDemand = live.filter((r) => r.mode === 'on-demand')
  const parts: string[] = []
  const inlined = (r: Rule) => !o.canFetch || items.get(r.id)!.tokens.body <= INLINE_MAX
  if (always.length) {
    const lines = always.map((r) => {
      const it = items.get(r.id)!
      const inline = inlined(r)
      return inline ? `- ${it.name}: ${it.body.replace(/\n{2,}/g, '\n')}` : `- ${it.name}: read it first with library_get('${it.id}') and follow it for the whole session.`
    })
    parts.push(`Always follow:\n${lines.join('\n')}`)
  }
  // The library line is only needed when something has to be fetched: an on-demand item, or an always-on one too long to put in the text.
  if (o.canFetch && (onDemand.length > 0 || always.some((r) => !inlined(r)))) {
    const lines = onDemand.map((r) => `- ${r.when || 'when it applies'}: ${r.id}`)
    parts.push(`Library: call library_index to see what is available for this workspace, and library_get(id) to read an item before doing the task it covers.${lines.length ? `\nWhen it applies:\n${lines.join('\n')}` : ''}`)
  }
  const core = parts.join('\n\n')
  const line = (rs: Rule[]) => (rs.length ? `Reminder: ${rs.map((r) => (r.mode === 'always' ? `${r.id} (always)` : `${r.id} (${r.when || 'when it applies'})`)).join('; ')}.` : '')
  const hard = live.filter((r) => r.strength === 'hard')
  // A note is easy to read past. The check asks for one visible line, so a rule that applies is not skipped by accident, and one passed over leaves its reason.
  const ids = hard.map((r) => r.id)
  const check = hard.length ? ` Before your first tool call, write one line: which of these apply to this request? If one does, read it first with library_get(${ids.length === 1 ? `'${ids[0]}'` : 'id'}). If you decide it does not apply, call library_skip(id, reason).` : ''
  const forced = o.canFetch && o.forcedCheck !== false ? check : ''
  const reminder = line(live.filter((r) => r.strength !== 'soft')) + (hard.length ? forced : '')
  const hardReminder = line(hard) + forced
  const coreTokens = tokens(core)
  return { core, coreTokens, overBudget: coreTokens > CORE_BUDGET, indexIds: live.map((r) => r.id), skills: live.map((r) => items.get(r.id)!).filter((i) => i.kind === 'skill'), reminder, hardReminder, forcedCheckTokens: tokens(check) }
}

export type Scope = 'global' | { workspace: string }

/** Playbooks kept as small files in the library folder: one global, one per workspace. */
export class Playbooks {
  constructor(private root: string) {}
  private file(scope: Scope) {
    return scope === 'global' ? join(this.root, 'playbooks', 'global.json') : join(this.root, 'playbooks', 'workspaces', `${scope.workspace}.json`)
  }
  private raw(scope: Scope): { rules?: unknown; features?: unknown } {
    try {
      return JSON.parse(readFileSync(this.file(scope), 'utf8')) as { rules?: unknown; features?: unknown }
    } catch {
      return {}
    }
  }
  read(scope: Scope): Rule[] {
    const raw = this.raw(scope)
    return Array.isArray(raw.rules) ? raw.rules.filter(isRule) : []
  }
  /** The switches this playbook sets (none, if it sets none). */
  readFeatures(scope: Scope): PlaybookFeatures {
    const f = this.raw(scope).features as PlaybookFeatures | undefined
    return typeof f?.forcedCheck === 'boolean' ? { forcedCheck: f.forcedCheck } : {}
  }
  writeFeatures(scope: Scope, features: PlaybookFeatures) {
    this.save(scope, this.read(scope), features)
  }
  /** When a playbook last changed (0 if it never did). */
  changedAt(scope: Scope): number {
    try {
      return statSync(this.file(scope)).mtimeMs
    } catch {
      return 0
    }
  }
  write(scope: Scope, rules: Rule[]) {
    this.save(scope, rules, this.readFeatures(scope))
  }
  private save(scope: Scope, rules: Rule[], features: PlaybookFeatures) {
    const file = this.file(scope)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ rules: rules.filter(isRule), ...(Object.keys(features).length ? { features } : {}) }, null, 2))
  }
}

const MODES = ['always', 'on-demand', 'step', 'off']
const STRENGTHS = ['soft', 'medium', 'hard']
export function isRule(r: unknown): r is Rule {
  const x = r as Rule
  return !!x && typeof x.id === 'string' && MODES.includes(x.mode) && typeof x.when === 'string' && STRENGTHS.includes(x.strength)
}
