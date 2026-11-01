/** The line that ends a delivered message, telling the recipient whether to answer. Shared so the chat can tell it from the sender's words. */
export const replyTail = (fromName: string) => `When you have an answer, reply using the agent-world send_message tool with to="${fromName}" and expects_reply=false.`
export const noReplyTail = 'This is a reply to you. No reply is needed; carry on with your task.'

export interface AgentMail {
  from: string
  body: string
  expectsReply: boolean
  /** Set when it was a broadcast: the agents it was also sent to. */
  broadcast?: { also: string[] }
}

const head = /^\[Agent World\] Message from ([^:\n]+): /
const broadcastHead = /^\[Agent World\] Broadcast from ([^:\n(]+?)(?: \(also sent to: ([^)\n]*)\))?: /

/** What another agent sent, taken apart from the text that was typed into this agent's terminal; null for anything else. */
export function parseAgentMail(text: string): AgentMail | null {
  const b = broadcastHead.exec(text)
  const m = b ?? head.exec(text)
  if (!m) return null
  const from = m[1]!
  let body = text.slice(m[0].length)
  const expectsReply = body.endsWith(`\n\n${replyTail(from)}`)
  for (const tail of [replyTail(from), noReplyTail]) if (body.endsWith(`\n\n${tail}`)) body = body.slice(0, -tail.length - 2)
  return { from, body, expectsReply, ...(b && { broadcast: { also: b[2] ? b[2].split(', ') : [] } }) }
}

export type BroadcastState = 'delivered' | 'queued' | 'asleep' | 'limit'
export interface BroadcastRow {
  name: string
  status: BroadcastState
  reason: string
}

/** What the broadcast tool answers, a line for each agent ("name: state (why)"), read back for the sender's card; null for any other text. */
export function parseBroadcastResult(text: string): { id: string; rows: BroadcastRow[] } | null {
  const head = /^Broadcast to \d+ agents? \(id ([^)]+)\):\n/.exec(text)
  if (!head) return null
  const rows: BroadcastRow[] = []
  for (const line of text.slice(head[0].length).split('\n')) {
    const m = /^([^:\n]+): (delivered|queued|asleep|limit)(?: \((.*)\))?$/.exec(line)
    if (!m) break
    rows.push({ name: m[1]!, status: m[2] as BroadcastState, reason: m[3] ?? '' })
  }
  return { id: head[1]!, rows }
}

/** What the broadcast tool tells the sender: a line for each agent (read back by parseBroadcastResult), then what to expect. */
export function formatBroadcastResult(id: string, rows: (Omit<BroadcastRow, 'reason'> & { reason?: string })[]): string {
  const lines = rows.map((r) => `${r.name}: ${r.status}${r.reason || r.status === 'queued' ? ` (${r.reason || 'busy: it gets this when its turn ends'})` : ''}`)
  const left = rows.some((r) => r.status === 'asleep' || r.status === 'limit')
  return `Broadcast to ${rows.length} agent${rows.length === 1 ? '' : 's'} (id ${id}):\n${lines.join('\n')}\n\nReplies arrive as messages from each agent as it finishes; there is nothing to wait for.${left ? ' An agent marked asleep was not sent it: only the person can wake it, and you can send again once it is awake.' : ''}`
}
