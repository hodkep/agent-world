import type { PlanReadback } from './plan'
import { jsonIn } from './reply'

/** What a reviewer found when it read a diff against the plan the person approved. */
export type FindingKind = 'out-of-scope' | 'goal-unmet' | 'guess-wrong'
export interface Finding {
  kind: FindingKind
  file?: string
  /** Every file one finding covers, when the reviewer reports one finding for one cause. */
  files?: string[]
  text: string
}

/** The files a finding is about: the list it was given, else the one file. */
export const findingFiles = (f: Finding): string[] => f.files ?? (f.file ? [f.file] : [])

const KINDS: readonly string[] = ['out-of-scope', 'goal-unmet', 'guess-wrong']
const TEXT_MAX = 300
const FINDINGS_MAX = 10
const FILES_MAX = 30

function finding(raw: unknown): Finding | null {
  if (typeof raw !== 'object' || raw === null) return null
  const f = raw as Record<string, unknown>
  const text = typeof f.text === 'string' ? f.text.trim() : ''
  if (typeof f.kind !== 'string' || !KINDS.includes(f.kind) || !text) return null
  const files = Array.isArray(f.files) ? f.files.filter((x): x is string => typeof x === 'string' && x !== '').slice(0, FILES_MAX) : []
  return { kind: f.kind as FindingKind, ...(typeof f.file === 'string' && f.file && { file: f.file }), ...(files.length > 0 && { files }), text: text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text }
}

/** The findings in a reply, or null when the reply holds no findings list at all. */
export function parseAudit(reply: string): Finding[] | null {
  const found = jsonIn(reply) as { findings?: unknown } | null
  if (!Array.isArray(found?.findings)) return null
  return found.findings.flatMap((f) => finding(f) ?? []).slice(0, FINDINGS_MAX)
}

const INSTRUCTION = `You review a code change against the plan the person approved before it was built. Read the plan, then the diff. Report only what the person would want to know before merging:
- "out-of-scope": the diff does something the plan lists as out of scope, or changes files the goal does not need.
- "goal-unmet": the goal, as written, is not achieved by the diff.
- "guess-wrong": an assumption marked [guessed] is contradicted by what the diff does.
Do not comment on style, naming or anything the plan does not cover. If the diff matches the plan, report nothing.
Report one finding per cause: when the same thing shows in several files, say it once and list every one of them in "files".
Reply with JSON only, in this shape: {"findings":[{"kind":"out-of-scope"|"goal-unmet"|"guess-wrong","files":["path", "..."] (optional),"text":"one or two sentences"}]}. An empty list is a good answer.`

export interface AuditPrompt {
  prompt: string
  /** What the model was shown, for the line under the findings. */
  files: number
  lines: number
  truncated: boolean
}

const DIFF_MAX_BYTES = 40_000

/** Whole files from the start of the diff while they fit; a first file that alone is too big is cut mid-way. */
function fit(diff: string, maxBytes: number) {
  const parts = diff.split(/^(?=diff --git )/m).filter(Boolean)
  const kept: string[] = []
  let size = 0
  for (const part of parts) {
    if (size + part.length > maxBytes) break
    kept.push(part)
    size += part.length
  }
  if (!kept.length && parts[0]) kept.push(parts[0].slice(0, maxBytes))
  return { text: kept.join(''), shown: kept.length, total: parts.length }
}

export function auditPrompt(plan: PlanReadback, diff: string, o: { maxBytes?: number; /** What the person added to the plan after it was approved: in scope, so not to be reported. */ additions?: string[]; /** What the workflow's audit step asks the reviewer to look at as well: its brief. */ focus?: string } = {}): AuditPrompt {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- none')
  const { text, shown, total } = fit(diff, o.maxBytes ?? DIFF_MAX_BYTES)
  const truncated = shown < total
  const prompt = [
    INSTRUCTION,
    `## Goal\n${plan.goal}`,
    `## Assumptions\n${list(plan.assumptions.map((a) => `[${a.kind}] ${a.text}`))}`,
    `## Out of scope\n${list(plan.outOfScope)}`,
    ...(o.additions?.length ? [`## Added to the plan afterwards by the person: in scope\n${list(o.additions)}`] : []),
    ...(o.focus?.trim() ? [`## What the person asked you to look at as well\n${o.focus.trim()}`] : []),
    `## Diff${truncated ? ` (too big to send whole. Only the first ${shown} of ${total} files are shown)` : ''}\n${text}`
  ].join('\n\n')
  return { prompt, files: shown, lines: text.trimEnd().split('\n').length, truncated }
}
