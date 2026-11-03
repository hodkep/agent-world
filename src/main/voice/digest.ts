export interface AgentLine { name: string; state: string; doing?: string; /** What it said last, so the voice can tell what it did. */ last?: string; /** The agent the person has open in the app. */ open?: boolean }
export interface DigestInput { workspace: string; agents: AgentLine[]; todos: string[]; needsYou: string[]; notes: string[] }

/** Keys and tokens are blotted out before anything is handed to the voice: it speaks aloud and a tool may carry words onward. */
export const scrub = (s: string) =>
  s
    .replace(/AIza[\w-]{20,}/g, '[secret]')
    .replace(/\bsk-[\w-]{16,}/g, '[secret]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[secret]')
    .replace(/(Bearer\s+)[\w.~+/=-]{12,}/gi, '$1[secret]')
    .replace(/\b[a-f0-9]{40,}\b/gi, '[secret]')

/** What is going on in a workspace, in a few lines the voice can be told: the agents, what needs the person, the open todos and the notes. */
export function buildDigest(i: DigestInput, max = 1800): string {
  const agents = i.agents.map((a) => `${a.name}${a.open ? ' [open in the app]' : ''} (${a.state}${a.doing ? `: ${a.doing}` : ''}${a.last ? `; last said: "${a.last.slice(0, 160)}"` : ''})`).join('; ')
  const lines = [
    `Workspace "${i.workspace}". Agents: ${agents || 'none'}.`,
    i.needsYou.length ? `Needs the person: ${i.needsYou.join('; ')}.` : '',
    i.todos.length ? `Open todos: ${i.todos.join('; ')}.` : '',
    i.notes.length ? `Notes: ${i.notes.join('; ')}.` : ''
  ].filter(Boolean)
  const text = scrub(lines.join('\n'))
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
