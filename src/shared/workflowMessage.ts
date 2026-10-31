/** What the person sees in the chat for the sentence the app typed to the agent when they pressed a button on a workflow card. */
export interface WorkflowMessage {
  tone: 'ok' | 'go' | 'skip' | 'no' | 'back'
  icon: 'tick' | 'run' | 'skip' | 'cross' | 'push' | 'back'
  title: string
  /** The step or the note that goes with the title. */
  sub?: string
  /** The sentence as the agent got it, with its prefix when it had one. */
  told: string
}

const OFFICE = '[Agent World] '
const q = '"([^"\\n]+)"'
const note = (rest: string, lead: RegExp) => {
  const n = rest.replace(lead, '').trim()
  return n || undefined
}

/**
 * The messages the app types into an agent for the person (an answer to a plan or a step, a Run, a skip, a refusal, a go-ahead to push), told apart from what they wrote
 * by their exact wording, which the app's own code makes (src/shared/steps.ts, plan.ts, src/main/workflows/hint.ts). Null for anything else.
 */
export function parseWorkflowMessage(text: string): WorkflowMessage | null {
  // The go-ahead to push is typed as the person's own words, without the prefix.
  const push = /^The person approved the push of (\S+) \(([0-9a-f]{7})\)\./.exec(text)
  if (push) return { tone: 'ok', icon: 'push', title: 'Push approved', sub: `${push[1]} at ${push[2]}`, told: text }
  const audited = /^The audit of (\S+) \(([0-9a-f]{7})\) has passed\./.exec(text)
  if (audited) return { tone: 'ok', icon: 'push', title: 'Audit passed', sub: `${audited[1]} at ${audited[2]}`, told: text }
  if (!text.startsWith(OFFICE)) return null
  const body = text.slice(OFFICE.length)
  let m: RegExpExecArray | null
  if (body.startsWith('Your plan was approved. Go ahead and build it.')) return { tone: 'ok', icon: 'tick', title: 'Plan approved', ...sub(note(body, /^Your plan was approved\. Go ahead and build it\.\s*(Their note:)?/)), told: text }
  if (body.startsWith('The person asked for changes to your plan.')) return { tone: 'back', icon: 'back', title: 'Plan sent back', ...sub(note(body.split('\nRevise .agent-world/plan.md')[0]!, /^The person asked for changes to your plan\.\s*/)), told: text }
  if (body.startsWith('The person lifted the hold on your edits')) return { tone: 'skip', icon: 'skip', title: 'Hold lifted', told: text }
  if ((m = new RegExp(`^The person pressed Run: start your step ${q} now\\.`).exec(body))) return { tone: 'go', icon: 'run', title: 'Run', sub: m[1]!, told: text }
  if ((m = new RegExp(`^Your step ${q} was skipped by the person`).exec(body))) return { tone: 'skip', icon: 'skip', title: `Skipped ${m[1]}`, told: text }
  if ((m = new RegExp(`^The person refused your step ${q}`).exec(body))) return { tone: 'no', icon: 'cross', title: `Refused ${m[1]}`, told: text }
  if ((m = new RegExp(`^Your step ${q} was approved\\.\\s*(They said:)?`).exec(body))) return { tone: 'ok', icon: 'tick', title: `${m[1]} approved`, ...sub(note(body, new RegExp(`^Your step ${q} was approved\\.\\s*(They said:)?`))), told: text }
  if ((m = new RegExp(`^Your step ${q} was sent back`).exec(body))) return { tone: 'back', icon: 'back', title: `${m[1]} sent back`, ...sub(note(body.split(/\.?\s(?:Make the change|Do not push|If that means)/)[0]!, new RegExp(`^Your step ${q} was sent back:?\\.?\\s*`))), told: text }
  if ((m = /^The person approved skipping (.+?)(?:: (.*?))?\. They are done with\./s.exec(body))) return { tone: 'skip', icon: 'skip', title: `Skipped ${m[1]}`, ...sub(m[2]), told: text }
  if ((m = /^The person ended your task "(.+?)":/.exec(body))) return { tone: 'no', icon: 'cross', title: 'Ended this run', sub: m[1]!, told: text }
  if ((m = /^The person wants (.+?) kept, so they stay/.exec(body))) return { tone: 'back', icon: 'back', title: `Kept ${m[1]}`, told: text }
  if ((m = new RegExp(`^The person asks for your step ${q} again`).exec(body))) return { tone: 'go', icon: 'run', title: 'Asked again', sub: m[1]!, told: text }
  if ((m = new RegExp(`^The person did not approve your step ${q} yet`).exec(body))) return { tone: 'skip', icon: 'skip', title: `Not now: ${m[1]}`, told: text }
  if ((m = new RegExp(`^The person skipped the check ${q}`).exec(body))) return { tone: 'skip', icon: 'skip', title: `Skipped ${m[1]}`, told: text }
  return null
}

const sub = (s: string | undefined) => (s ? { sub: s } : {})
